// ============================================
// YouTubeプレーヤー制御モジュール
// ============================================
const PlayerController = {
    player: null,
    video: null,
    observers: [],
    _playerCheckInterval: null,
    _urlObserver: null,
    _bridgeObserver: null,
    _bridgeData: null,
    _lastCaptionTrackKey: null,
    _captionCommandSeq: 0,
    _autoEnabledVideoId: null,
    _autoEnableTimer: null,
    _autoEnableAttempts: 0,
    _captionClickHandler: null,
    _initialized: false,

    init() {
        if (this._initialized) {
            Logger.debug('プレーヤーコントローラーは既に初期化済みです');
            return;
        }
        this._initialized = true;
        this.waitForPlayer();
        this._watchBridgeData();
        Logger.info('プレーヤーコントローラーを初期化しました');
    },

    waitForPlayer() {
        if (this._playerCheckInterval) {
            clearInterval(this._playerCheckInterval);
            this._playerCheckInterval = null;
        }

        this._playerCheckInterval = setInterval(() => {
            const video = document.querySelector('video');
            const player = document.querySelector('#movie_player');

            if (video && player) {
                clearInterval(this._playerCheckInterval);
                this._playerCheckInterval = null;
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
        this.setupCaptionManualOffListener();
        this.setupVideoChangeListener();
    },

    // 自動ONの直後（ONを確認する前）に手動でOFFにされた場合も、その意思を尊重する。
    // 字幕ボタンのクリック時点でONなら、これからOFFにする操作と判断できる。
    setupCaptionManualOffListener() {
        if (this._captionClickHandler) return;
        this._captionClickHandler = (event) => {
            const target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            if (!target.closest('.ytp-subtitles-button')) return;
            if (!this.areCaptionsOn()) return;
            const currentVideoId = typeof getYouTubeVideoId === 'function' ? getYouTubeVideoId() : null;
            if (!currentVideoId) return;
            const autoEnablePending = this._autoEnableTimer || this._autoEnabledVideoId === currentVideoId;
            if (!autoEnablePending) return;
            this._autoEnabledVideoId = currentVideoId;
            this._clearAutoEnableRetry();
            Logger.debug('手動で字幕をOFFにしたため、自動ONの再試行を停止します');
        };
        document.addEventListener('click', this._captionClickHandler, true);
    },

    setupVideoChangeListener() {
        if (this._urlObserver) {
            this._urlObserver.disconnect();
            this._urlObserver = null;
        }

        let lastUrl = location.href;
        this._urlObserver = new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                Logger.debug('ページ遷移を検知しました');
                if (typeof SubtitleEnhancer !== 'undefined' && SubtitleEnhancer.cleanup) {
                    SubtitleEnhancer.cleanup();
                }
                if (typeof UIController !== 'undefined' && UIController.cleanup) {
                    UIController.cleanup();
                }
                setTimeout(() => this.waitForPlayer(), 1000);
            }
        });
        this._urlObserver.observe(document, {subtree: true, childList: true});
    },

    _watchBridgeData() {
        const el = document.getElementById('yse-data-bridge');
        if (!el) {
            setTimeout(() => this._watchBridgeData(), 1000);
            return;
        }
        if (this._bridgeObserver) this._bridgeObserver.disconnect();
        let lastValue = el.getAttribute('data-player-response');
        const remember = (value) => {
            if (!value) return;
            try {
                const payload = JSON.parse(value);
                const currentVid = typeof getYouTubeVideoId === 'function' ? getYouTubeVideoId() : null;
                if (!payload.videoId || !currentVid || payload.videoId === currentVid) {
                    this._bridgeData = payload;
                }
            } catch (e) {
                Logger.debug('ブリッジデータの解析に失敗:', e);
            }
        };
        remember(lastValue);
        this._bridgeObserver = new MutationObserver(() => {
            const value = el.getAttribute('data-player-response');
            if (value && value !== lastValue) {
                lastValue = value;
                remember(value);
                Logger.debug('ブリッジのプレーヤーデータが更新されました');
                this.autoSelectSubtitle();
            }
        });
        this._bridgeObserver.observe(el, { attributes: true, attributeFilter: ['data-player-response'] });
    },

    cleanup() {
        if (this._playerCheckInterval) {
            clearInterval(this._playerCheckInterval);
            this._playerCheckInterval = null;
        }
        if (this._urlObserver) {
            this._urlObserver.disconnect();
            this._urlObserver = null;
        }
        if (this._bridgeObserver) {
            this._bridgeObserver.disconnect();
            this._bridgeObserver = null;
        }
        this.player = null;
        this.video = null;
        this._bridgeData = null;
        this._lastCaptionTrackKey = null;
        this._autoEnabledVideoId = null;
        this._clearAutoEnableRetry();
        Logger.info('プレーヤーコントローラーをクリーンアップしました');
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
                        const payload = JSON.parse(dataStr);
                        const currentVid = typeof getYouTubeVideoId === 'function' ? getYouTubeVideoId() : null;
                        if (payload.videoId && currentVid && payload.videoId !== currentVid) {
                            Logger.debug(`ブリッジデータが別動画(${payload.videoId})のため無視します`);
                        } else {
                            playerResponse = payload;
                            this._bridgeData = payload;
                            Logger.info('ブリッジ要素からplayerResponseを取得しました');
                        }
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
                return this._tagCaptionTracks(tracklistRenderer.captionTracks, tracklistRenderer);
            }

            if (captions.captionTracks) {
                Logger.info(`${captions.captionTracks.length}件の字幕トラックを発見`);
                return this._tagCaptionTracks(captions.captionTracks, tracklistRenderer || captions);
            }

            Logger.warn('字幕トラックが見つかりませんでした');
            return [];
        } catch (e) {
            Logger.error('字幕トラック取得エラー:', e);
            return [];
        }
    },

    // 字幕トラックへ「自動ダブ（多言語音声）付き動画か」を付与する。
    // 自動ダブ付き動画の caps=asr トラックはYouTubeの自動翻訳字幕と判定するため。
    _tagCaptionTracks(tracks, renderer) {
        const hasDubbedAudio = !!(renderer && (renderer.audioTracks || []).some(t => t.audioTrackId));
        return tracks.map(t => (t && typeof t === 'object')
            ? Object.assign({}, t, { _yseHasDubbedAudio: hasDubbedAudio })
            : t);
    },

    _getBridgePayload() {
        if (!this._bridgeData) {
            const bridge = document.getElementById('yse-data-bridge');
            const raw = bridge && bridge.getAttribute('data-player-response');
            if (raw) {
                try { this._bridgeData = JSON.parse(raw); } catch (e) {}
            }
        }
        const data = this._bridgeData;
        if (!data) return null;
        const currentVid = typeof getYouTubeVideoId === 'function' ? getYouTubeVideoId() : null;
        if (data.videoId && currentVid && data.videoId !== currentVid) return null;
        return data;
    },

    _normalizeLanguage(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return null;
        const primary = raw.split(/[-_.]/)[0];
        if (!primary || primary === 'und' || primary === 'zxx') return null;
        return primary;
    },

    getUserLanguage() {
        const raw = (typeof navigator !== 'undefined' &&
            (navigator.language || (navigator.languages && navigator.languages[0]))) ||
            Settings.get('preferredLanguage') || '';
        return this._normalizeLanguage(raw);
    },

    getAudioLanguage() {
        const data = this._getBridgePayload();
        if (!data) return null;
        return this._normalizeLanguage(
            data.audioLanguage ||
            (data.videoDetails && data.videoDetails.defaultAudioLanguage)
        );
    },

    isForeignAudio() {
        const audio = this.getAudioLanguage();
        const user = this.getUserLanguage();
        return !!(audio && user && audio !== user);
    },

    getChannelInfo() {
        const data = this._getBridgePayload();
        const details = (data && data.videoDetails) || {};
        let channelId = details.channelId || null;
        let channelTitle = details.channelTitle || null;
        if (!channelId) {
            const meta = document.querySelector('meta[itemprop="channelId"]');
            if (meta && meta.content) channelId = meta.content;
        }
        if (!channelTitle) {
            const nameEl = document.querySelector(
                'ytd-watch-metadata #owner #channel-name a, ytd-video-owner-renderer #channel-name a'
            );
            if (nameEl) channelTitle = nameEl.textContent.trim();
        }
        return channelId ? { channelId, channelTitle } : null;
    },

    getChannelCaptionMode() {
        const channel = this.getChannelInfo();
        if (!channel) return 'auto';
        const modes = Settings.get('channelCaptionModes') || {};
        const entry = modes[channel.channelId];
        return entry && (entry.mode === 'always' || entry.mode === 'off') ? entry.mode : 'auto';
    },

    areCaptionsOn() {
        const button = document.querySelector('.ytp-subtitles-button');
        return !!button && button.getAttribute('aria-pressed') === 'true';
    },

    _setCaptionTrack(track) {
        const key = JSON.stringify(track || {});
        if (key === this._lastCaptionTrackKey) {
            Logger.debug('字幕トラックは選択済みのためスキップ');
            return;
        }
        this._lastCaptionTrackKey = key;
        try {
            if (this.player && typeof this.player.setOption === 'function') {
                this.player.setOption('captions', 'track', track);
                return;
            }
        } catch (e) {
            Logger.debug('直接の字幕設定に失敗したためブリッジ経由で再試行します:', e);
        }
        this._captionCommandSeq += 1;
        document.dispatchEvent(new CustomEvent('YSE_PLAYER_COMMAND', {
            detail: {
                requestId: 'yse-caption-' + Date.now() + '-' + this._captionCommandSeq,
                command: 'setCaptionTrack',
                args: { track }
            }
        }));
    },

    setSubtitlesEnabled(enabled) {
        this._setCaptionTrack(enabled ? {} : {'languageCode': ''});
    },

    setSubtitleLanguage(langCode) {
        this._setCaptionTrack({'languageCode': langCode});
        Logger.info(`字幕言語を設定: ${langCode}`);
    },

    setAutoTranslation(sourceLang, targetLang) {
        this._setCaptionTrack({
            'languageCode': sourceLang,
            'translationLanguage': {'languageCode': targetLang}
        });
        Logger.info(`自動翻訳を設定: ${sourceLang} → ${targetLang}`);
    },

    getCurrentSubtitleTrack() {
        try {
            const player = this.player;
            if (player && player.getOption) {
                const track = player.getOption('captions', 'track');
                if (track && track.languageCode) {
                    return track;
                }
            }
        } catch (e) {
            Logger.debug('現在の字幕トラック取得エラー:', e);
        }
        return null;
    },

    _isTrackAlreadySelected(languageCode, translationLanguageCode) {
        const current = this.getCurrentSubtitleTrack();
        if (!current || current.languageCode !== languageCode) return false;
        if (translationLanguageCode) {
            return !!(current.translationLanguage &&
                current.translationLanguage.languageCode === translationLanguageCode);
        }
        return !current.translationLanguage;
    },

    _clearAutoEnableRetry() {
        if (this._autoEnableTimer) {
            clearTimeout(this._autoEnableTimer);
            this._autoEnableTimer = null;
        }
        this._autoEnableAttempts = 0;
    },

    // 字幕トラックがまだ用意されていない場合に備えて、少し待ってから再評価する。
    // 字幕がONになった時点で _clearAutoEnableRetry() が試行回数を戻す。
    _scheduleAutoEnableRetry() {
        if (this._autoEnableTimer || this._autoEnableAttempts >= 5) return;
        this._autoEnableTimer = setTimeout(() => {
            this._autoEnableTimer = null;
            this._autoEnableAttempts += 1;
            this.autoSelectSubtitle();
        }, 2000);
    },

    autoSelectSubtitle(force = false) {
        if (Settings.get('enabled') === false) {
            this._clearAutoEnableRetry();
            return;
        }
        if (force) {
            this._autoEnabledVideoId = null;
            this._clearAutoEnableRetry();
        }
        const currentVideoId = typeof getYouTubeVideoId === 'function' ? getYouTubeVideoId() : null;
        const tracks = this.getSubtitleTracks();
        const preferredLang = Settings.get('preferredLanguage');
        const fallbackLang = Settings.get('fallbackLanguage');
        const autoTranslate = Settings.get('autoTranslateIfNotAvailable');

        Logger.debug('利用可能な字幕トラック:', tracks.map(t => t.languageCode));

        // ネイティブ日本語字幕（自動生成ではない）を検出したら拡張機能の処理を無効化
        const nativeJapaneseTrack = tracks.find(t =>
            t.languageCode.startsWith('ja') &&
            isManualSubtitleTrack(t)
        );
        if (nativeJapaneseTrack) {
            Logger.info('✅ ネイティブ日本語字幕を検出しました。拡張機能の字幕加工をスキップします');
            if (typeof SubtitleEnhancer !== 'undefined') {
                SubtitleEnhancer.setNativeSubtitleMode(true);
            }
        } else {
            if (typeof SubtitleEnhancer !== 'undefined') {
                SubtitleEnhancer.setNativeSubtitleMode(false);
            }
        }

        // チャンネル設定と音声言語から、字幕を自動でONにするか決める。
        // 対象外のチャンネルでは字幕OFFのままにして、YouTube側の選択を尊重する。
        const captionsOn = this.areCaptionsOn();
        const channelMode = this.getChannelCaptionMode();
        const foreignAudio = this.isForeignAudio();
        const shouldAutoEnable = channelMode === 'always' || (channelMode === 'auto' && foreignAudio);

        // 自動ONの対象チャンネルで字幕がONの状態を確認したら、この動画では
        // 以後の手動OFFを尊重する。
        if (shouldAutoEnable && captionsOn && currentVideoId) {
            this._autoEnabledVideoId = currentVideoId;
            this._clearAutoEnableRetry();
        }

        if (!captionsOn && !shouldAutoEnable) {
            Logger.debug(
                `字幕OFFのため自動選択をスキップ (channel=${channelMode}, audio=${this.getAudioLanguage() || 'unknown'}, user=${this.getUserLanguage() || 'unknown'})`
            );
            return;
        }

        // 一度自動ONした動画でユーザーが字幕をOFFにしたら、その意思を尊重する。
        // チャンネル設定を変えたときは force=true でこの抑制を解除する。
        if (!captionsOn && !force && currentVideoId && this._autoEnabledVideoId === currentVideoId) {
            Logger.debug('この動画では自動ON済みのため、手動OFFを尊重します');
            return;
        }

        if (!captionsOn) {
            // 現在の字幕トラックに関係なく、自動ONのための選択を再適用する。
            // ONになったことを確認するまでは自動ON済みにしない（失敗時に再試行する）。
            this._lastCaptionTrackKey = null;
            this._scheduleAutoEnableRetry();
            Logger.info(
                `字幕を自動でONにします (channel=${channelMode}, audio=${this.getAudioLanguage() || 'unknown'}, user=${this.getUserLanguage() || 'unknown'})`
            );
        }

        const preferredTrack = tracks.find(
            t => t.languageCode === preferredLang ||
            t.languageCode.startsWith(preferredLang));

        if (preferredTrack) {
            const hasTlangParam = preferredTrack.baseUrl && preferredTrack.baseUrl.includes('tlang=');
            if (hasTlangParam) {
                // 翻訳済みURL → 翻訳として設定
                if (this._isTrackAlreadySelected(preferredTrack.languageCode, preferredLang)) {
                    Logger.debug('既に選択済みのためスキップ');
                } else {
                    this.setAutoTranslation(preferredTrack.languageCode, preferredLang);
                    Logger.info(`自動翻訳字幕を選択: ${preferredTrack.languageCode}`);
                }
            } else {
                // 同一言語トラック（ASR含む）は直接選択
                if (this._isTrackAlreadySelected(preferredTrack.languageCode)) {
                    Logger.debug('既に選択済みのためスキップ');
                } else {
                    this.setSubtitleLanguage(preferredTrack.languageCode);
                    Logger.info(`優先言語の字幕を選択: ${preferredTrack.languageCode}`);
                }
            }
            return;
        }

        const fallbackTrack = tracks.find(
            t => t.languageCode === fallbackLang ||
            t.languageCode.startsWith(fallbackLang));

        if (fallbackTrack) {
            if (autoTranslate) {
                if (this._isTrackAlreadySelected(fallbackTrack.languageCode, preferredLang)) {
                    Logger.debug('既に選択済みのためスキップ');
                } else {
                    this.setAutoTranslation(fallbackTrack.languageCode, preferredLang);
                    Logger.info(`フォールバック字幕から自動翻訳: ${fallbackTrack.languageCode} → ${preferredLang}`);
                }
            } else {
                if (this._isTrackAlreadySelected(fallbackTrack.languageCode)) {
                    Logger.debug('既に選択済みのためスキップ');
                } else {
                    this.setSubtitleLanguage(fallbackTrack.languageCode);
                    Logger.info(`フォールバック言語の字幕を選択: ${fallbackTrack.languageCode}`);
                }
            }
            return;
        }

        if (autoTranslate && tracks.length > 0) {
            const firstTrack = tracks[0];
            if (this._isTrackAlreadySelected(firstTrack.languageCode, preferredLang)) {
                Logger.debug('既に選択済みのためスキップ');
            } else {
                this.setAutoTranslation(firstTrack.languageCode, preferredLang);
                Logger.info(`字幕を自動翻訳: ${firstTrack.languageCode} → ${preferredLang}`);
            }
            return;
        }

        Logger.warn('利用可能な字幕が見つかりませんでした');
    }
};

window.PlayerController = PlayerController;
