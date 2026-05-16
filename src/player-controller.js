// ============================================
// YouTubeプレーヤー制御モジュール
// ============================================
const PlayerController = {
    player: null,
    observers: [],

    init() {
        this.waitForPlayer();
        Logger.info('プレーヤーコントローラーを初期化しました');
    },

    waitForPlayer() {
        const checkInterval = setInterval(() => {
            const video = document.querySelector('video');
            const player = document.querySelector('#movie_player');

            if (video && player) {
                clearInterval(checkInterval);
                this.player = player;
                this.video = video;
                this.onPlayerReady();
            }
        }, 500);
    },

    onPlayerReady() {
        Logger.info('プレーヤーが準備完了しました');
        SubtitleEnhancer.init();
        UIController.init();
        // 優先言語の字幕トラックを選択
        this.autoSelectSubtitle();
        this.setupVideoChangeListener();
    },

    setupVideoChangeListener() {
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                Logger.debug('ページ遷移を検知しました');
                if (typeof SubtitleEnhancer !== 'undefined' && SubtitleEnhancer.cleanup) {
                    SubtitleEnhancer.cleanup();
                }
                setTimeout(() => this.waitForPlayer(), 1000);
            }
        }).observe(document, {subtree: true, childList: true});
    },

    getPlayerConfig() {
        try {
            return yt.player.Application.create(null, {});
        } catch (e) {
            return null;
        }
    },

    getSubtitleTracks() {
        try {
            let playerResponse = null;

            // 1. ブリッジ要素からの取得（メインワールドからの同期的な受け渡し）
            const bridge = document.getElementById('yse-data-bridge');
            if (bridge) {
                const dataStr = bridge.getAttribute('data-player-response');
                if (dataStr) {
                    try {
                        playerResponse = JSON.parse(dataStr);
                        Logger.info('ブリッジ要素からplayerResponseを取得しました');
                    } catch (e) {}
                }
            }

            // 2. YouTubeのHTMLソース内に埋め込まれた初期データを解析（SPAでない場合の予備）
            if (!playerResponse) {
                const scripts = Array.from(document.getElementsByTagName('script'));
                const responseScript = scripts.find(s => s.textContent.includes('ytInitialPlayerResponse = '));
                
                if (responseScript) {
                    try {
                        const text = responseScript.textContent;
                        const startIdx = text.indexOf('ytInitialPlayerResponse = ') + 'ytInitialPlayerResponse = '.length;
                        const endIdx = text.indexOf('};', startIdx) + 1;
                        const jsonStr = text.substring(startIdx, endIdx);
                        playerResponse = JSON.parse(jsonStr);
                        Logger.info('HTML内スクリプトからplayerResponseを抽出しました');
                    } catch (e) {
                        Logger.debug('HTML内スクリプトの解析に失敗:', e);
                    }
                }
            }

            // 3. ページ上のグローバル変数（メインワールド注入時のみ有効）
            if (!playerResponse) {
                if (typeof window.ytInitialPlayerResponse !== 'undefined' && window.ytInitialPlayerResponse) {
                    playerResponse = window.ytInitialPlayerResponse;
                    Logger.info('グローバル変数からplayerResponseを取得しました');
                }
            }

            if (!playerResponse) {
                Logger.warn('プレーヤーレスポンスが見つかりません');
                return [];
            }

            const captions = playerResponse.captions;
            if (!captions) {
                // captainsがない場合、構造が古いか特殊
                Logger.warn('playerResponseの中にcaptionsフィールドがありません', Object.keys(playerResponse).filter(k=>k!=='streamingData'));
                return [];
            }

            const tracklistRenderer = captions.playerCaptionsTracklistRenderer;
            if (tracklistRenderer && tracklistRenderer.captionTracks) {
                Logger.info(`${tracklistRenderer.captionTracks.length}件の字幕トラックを発見`);
                return tracklistRenderer.captionTracks;
            }

            if (captions.captionTracks) {
                Logger.info(`${captions.captionTracks.length}件の字幕トラックを発見`);
                return captions.captionTracks;
            }

            Logger.warn('字幕トラックが見つかりませんでした');
            return [];
        } catch (e) {
            Logger.error('字幕トラック取得エラー:', e);
            return [];
        }
    },

    setSubtitlesEnabled(enabled) {
        try {
            const player = this.player;
            if (player && player.setOption) {
                player.setOption('captions', 'track', enabled ? {} : {'languageCode': ''});
            }
        } catch (e) {
            Logger.error('字幕設定エラー:', e);
        }
    },

    setSubtitleLanguage(langCode) {
        try {
            const player = this.player;
            if (player && player.setOption) {
                player.setOption('captions', 'track', {'languageCode': langCode});
                Logger.info(`字幕言語を設定: ${langCode}`);
            }
        } catch (e) {
            Logger.error('字幕言語設定エラー:', e);
        }
    },

    setAutoTranslation(targetLang) {
        try {
            const player = this.player;
            if (player && player.setOption) {
                player.setOption('captions', 'track', {
                    'languageCode': targetLang,
                    'translationLanguage': {'languageCode': targetLang}
                });
                Logger.info(`自動翻訳を設定: ${targetLang}`);
            }
        } catch (e) {
            Logger.error('自動翻訳設定エラー:', e);
        }
    },

    autoSelectSubtitle() {
        const tracks = this.getSubtitleTracks();
        const preferredLang = Settings.get('preferredLanguage');
        const fallbackLang = Settings.get('fallbackLanguage');
        const autoTranslate = Settings.get('autoTranslateIfNotAvailable');

        Logger.debug('利用可能な字幕トラック:', tracks.map(t => t.languageCode));

        const preferredTrack = tracks.find(
            t => t.languageCode === preferredLang ||
            t.languageCode.startsWith(preferredLang));

        if (preferredTrack) {
            const isTranslated = preferredTrack.kind === 'asr' ||
                preferredTrack.kind === 'forced' ||
                (preferredTrack.baseUrl && preferredTrack.baseUrl.includes('tlang='));

            if (isTranslated) {
                this.setAutoTranslation(preferredLang);
                Logger.info(`自動翻訳字幕を選択: ${preferredTrack.languageCode}`);
            } else {
                this.setSubtitleLanguage(preferredTrack.languageCode);
                Logger.info(`優先言語の字幕を選択: ${preferredTrack.languageCode}`);
            }
            return;
        }

        const fallbackTrack = tracks.find(
            t => t.languageCode === fallbackLang ||
            t.languageCode.startsWith(fallbackLang));

        if (fallbackTrack) {
            if (autoTranslate) {
                this.setAutoTranslation(preferredLang);
                Logger.info(`フォールバック字幕から自動翻訳: ${fallbackTrack.languageCode} → ${preferredLang}`);
            } else {
                this.setSubtitleLanguage(fallbackTrack.languageCode);
                Logger.info(`フォールバック言語の字幕を選択: ${fallbackTrack.languageCode}`);
            }
            return;
        }

        if (autoTranslate && tracks.length > 0) {
            const firstTrack = tracks[0];
            this.setAutoTranslation(preferredLang);
            Logger.info(`字幕を自動翻訳: ${firstTrack.languageCode} → ${preferredLang}`);
            return;
        }

        Logger.warn('利用可能な字幕が見つかりませんでした');
    }
};

window.PlayerController = PlayerController;
