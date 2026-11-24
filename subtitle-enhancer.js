// ============================================
// 字幕表示改善モジュール
// ============================================
const SubtitleEnhancer = {
  captionContainer: null,
  currentSentence: "",
  yseOverlay: null,
  textElement: null,
  playerContainer: null,
  isDragging: false,
  dragStartY: 0,
  overlayStartBottom: 0,
  isCustomPosition: false,
  pollTimer: null,
  isSubtitleEnabled: false,
  currentCaptionWindow: null,
  captionBlocks: [],
  captionBlocksVideoId: null,
  currentVideoId: null,
  isFetching: false,
  lastFetchTime: 0,
  fetchErrorCount: 0,
  fetchBlocked: false,
  _initialized: false,
  _interceptHandler: null,
  _navigateHandler: null,
  _timeUpdateHandler: null,
  _dragMouseMoveHandler: null,
  _dragMouseUpHandler: null,
  _videoElement: null,

  _currentSegments: [],
  _segmentIndex: -1,
  _segmentBlockStart: 0,
  _segmentBlockEnd: 0,
  _segmentStartTimes: null,
  _pendingTruncationCheck: false,
  _resizeObserver: null,
  nativeSubtitleMode: false,
  _nativeStyleElement: null,
  currentSubtitleLanguage: null,
  currentTrackIsTranslated: false,
  _languageCheckInterval: null,

  init() {
    if (this._initialized) {
      Logger.debug('字幕エンハンサーは既に初期化済みです');
      return;
    }
    this._initialized = true;

    this.createOverlay();
    this.startPolling();
    this.setupEventListeners();

    // ブリッジからのインターセプト通知をリッスン
    if (!this._interceptHandler) {
      this._interceptHandler = (e) => {
        if (e.detail && e.detail.text) {
          const currentVid = getYouTubeVideoId();
          const dataVid = e.detail.url ? getYouTubeVideoId(e.detail.url) : null;
          if (currentVid && dataVid && currentVid !== dataVid) {
            Logger.debug(`別動画の字幕データを無視しました (${dataVid})`);
            return;
          }
          Logger.info(`ブリッジからインターセプトされた字幕データを受信しました (${e.detail.text.length}バイト)`);
          try {
            const data = JSON.parse(e.detail.text);
            if (data && data.events) {
              const blocks = this.parseJson3(data);
              if (blocks.length > 0) {
                this.captionBlocks = blocks;
                this.captionBlocksVideoId = currentVid || dataVid || null;
                this.stopDomWatch();
                Logger.info(`インターセプトした字幕の解析完了 (ブロック数: ${blocks.length})`);
              }
            }
          } catch (err) {
            Logger.error("インターセプトしたデータのパースに失敗:", err);
          }
        }
      };
      document.addEventListener("YSE_INTERCEPTED_SUBTITLE", this._interceptHandler);
    }

    // 初期ロード時は傍受がリスナー登録より先に完了していることがあるため、
    // ブリッジに保持済みデータの再送を依頼する
    document.dispatchEvent(new CustomEvent("YSE_GET_INTERCEPTED_SUBTITLE"));

    this.fetchSubtitles();
    this.setupDomWatch();

    Logger.info("字幕エンハンサーを初期化しました");
  },

  _reevaluateNativeSubtitleMode(tracks) {
    if (!tracks || tracks.length === 0) return;
    const nativeJapaneseTrack = tracks.find(t =>
      t.languageCode.startsWith('ja') && isManualSubtitleTrack(t)
    );
    this.setNativeSubtitleMode(!!nativeJapaneseTrack);
  },

  setNativeSubtitleMode(enabled) {
    // 同じモードでもスタイル要素がDOMから失われている場合は再適用する
    // （SPA遷移後のcleanupやYouTubeによるhead操作で要素が消えたケースの回復）
    const styleInDom = !!document.getElementById("yse-native-subtitle-styles");
    if (this.nativeSubtitleMode === enabled && (!enabled || styleInDom)) return;
    this.nativeSubtitleMode = enabled;
    if (enabled) {
      Logger.info("ネイティブ日本語字幕モード: 背景・フォントのみ適用します");
      this.hideOverlay();
      this.hideOriginalCaptions(false);
      this._applyNativeStyles();
      this.stopDomWatch();
      this._resetSegmentState();
      this.currentSentence = "";
      this.lastText = "";
    } else {
      Logger.info("ネイティブ日本語字幕モードを解除しました");
      this._removeNativeStyles();
    }
  },

  _applyNativeStyles() {
    const fontSize = Settings.get("fontSize");
    const fontColor = Settings.get("fontColor");
    const bgColor = Settings.get("backgroundColor");
    const fontFamily = Settings.get("fontFamily");
    const textShadow = Settings.get("textShadow");
    const lineHeight = Settings.get("lineHeight");
    const letterSpacing = Settings.get("letterSpacing");
    const fontWeight = Settings.get("fontWeight");
    const captionWidth = Settings.get("captionWidth");

    if (!this._nativeStyleElement || !this._nativeStyleElement.isConnected) {
      this._nativeStyleElement = document.createElement("style");
      this._nativeStyleElement.id = "yse-native-subtitle-styles";
      document.head.appendChild(this._nativeStyleElement);
    }
    this._nativeStyleElement.textContent = `
        .ytp-caption-window-container { display: block; }
        .caption-window,
        .ytp-caption-window,
        .ytp-caption-window-top,
        .ytp-caption-window-bottom {
          font-family: ${fontFamily};
          font-size: ${fontSize}px !important;
          color: ${fontColor};
          font-weight: ${fontWeight};
          line-height: ${lineHeight};
          letter-spacing: ${letterSpacing}px;
          max-width: ${captionWidth}vw;
        }
        .ytp-caption-segment {
          font-family: ${fontFamily} !important;
          font-size: ${fontSize}px !important;
          color: ${fontColor};
          font-weight: ${fontWeight};
          background: ${bgColor};
          text-shadow: ${textShadow};
          padding: 2px 6px;
          border-radius: 4px;
          -webkit-box-decoration-break: clone;
          box-decoration-break: clone;
        }
      `;
  },

  _removeNativeStyles() {
    if (this._nativeStyleElement) {
      this._nativeStyleElement.remove();
      this._nativeStyleElement = null;
    }
  },

  setupEventListeners() {
    if (this._navigateHandler) {
      document.removeEventListener("yt-navigate-finish", this._navigateHandler);
    }

    if (!this._timeUpdateHandler) {
      this._timeUpdateHandler = () => {
        if (this.isSubtitleEnabled) {
          this.updateDisplayFromTime();
        }
      };
    }

    const attachTimeUpdate = () => {
      const video = document.querySelector("video");
      if (video) {
        if (this._videoElement && this._videoElement !== video) {
          this._videoElement.removeEventListener("timeupdate", this._timeUpdateHandler);
        }
        if (this._videoElement !== video) {
          this._videoElement = video;
          video.addEventListener("timeupdate", this._timeUpdateHandler);
        }
      }
    };

    attachTimeUpdate();

    this._navigateHandler = () => {
      // 初回ロード直後のnavigate-finishでも、傍受済みの同一動画ブロックは保持する
      if (shouldDiscardBlocksForVideo(this.captionBlocksVideoId, getYouTubeVideoId())) {
        this.captionBlocks = [];
        this.captionBlocksVideoId = null;
      }
      this.currentVideoId = null;
      this.currentSentence = "";
      this.isFetching = false;
      this.fetchBlocked = false;
      this.fetchErrorCount = 0;
      setTimeout(() => this.fetchSubtitles(), 500);
      setTimeout(attachTimeUpdate, 1000);
    };
    document.addEventListener("yt-navigate-finish", this._navigateHandler);
  },

  createOverlay() {
    if (this.yseOverlay) return;

    this.playerContainer = document.querySelector(
      ".html5-video-player, #movie_player",
    );
    if (!this.playerContainer) {
      console.warn("[YSE] プレイヤーが見つかりません");
      return;
    }

    this.yseOverlay = document.createElement("div");
    this.yseOverlay.id = "yse-caption-overlay";
    this.yseOverlay.className = "yse-caption-overlay";
    this.yseOverlay.style.cssText = `
            position: absolute !important;
            left: 0 !important;
            right: 0 !important;
            margin-left: auto !important;
            margin-right: auto !important;
            width: fit-content !important;
            max-width: ${Settings.get('captionWidth')}% !important;
            bottom: 10% !important;
            text-align: center !important;
            z-index: 40 !important;
            padding: 8px 16px !important;
            border-radius: 8px !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            word-break: keep-all !important;
            line-height: 1.4 !important;
            letter-spacing: 0.5px !important;
            font-size: 24px !important;
            color: #ffffff !important;
            background: rgba(0, 0, 0, 0.50) !important;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8) !important;
            display: none !important;
            font-family: "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif !important;
            cursor: grab !important;
            user-select: none !important;
            pointer-events: auto !important;
        `;

    this.textElement = document.createElement("div");
    this.textElement.className = "yse-caption-text";
    this.textElement.style.cssText = `
            display: block !important;
            word-break: normal !important;
        `;
    this.yseOverlay.appendChild(this.textElement);

    this.playerContainer.appendChild(this.yseOverlay);
    this.setupDrag();
  },

  startPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    this.pollTimer = setInterval(() => {
      this.checkState();
    }, 100); // 200ms -> 100msに変更して更新を高速化

    this.checkState();
  },

  checkState() {
    const isExtensionEnabled = Settings.get("enabled") !== false;

    if (!isExtensionEnabled) {
      if (this.yseOverlay && this.yseOverlay.style.display !== "none") {
        this.hideOverlay();
      }
      this.hideOriginalCaptions(false);
      return;
    }

    if (this.nativeSubtitleMode) {
      if (this.yseOverlay && this.yseOverlay.style.display !== "none") {
        this.hideOverlay();
      }
      this.hideOriginalCaptions(false);
      return;
    }

    const button = document.querySelector(".ytp-subtitles-button");
    const wasEnabled = this.isSubtitleEnabled;
    this.isSubtitleEnabled =
      button && button.getAttribute("aria-pressed") === "true";

    if (this.isSubtitleEnabled !== wasEnabled) {
      Logger.info(`字幕が${this.isSubtitleEnabled ? 'ON' : 'OFF'}になりました`);
    }

    if (!this.isSubtitleEnabled) {
      if (wasEnabled) {
        this.hideOverlay();
        this.lastText = "";
        this.currentSentence = "";
        this._resetSegmentState();
        this.stopDomWatch();
        if (this._domWatchDisplayTimer) {
          clearTimeout(this._domWatchDisplayTimer);
          this._domWatchDisplayTimer = null;
        }
        if (this.flushTimer) {
          clearTimeout(this.flushTimer);
          this.flushTimer = null;
        }
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
      }
      this.currentCaptionWindow = null;
      this.hideOriginalCaptions(false);
      return;
    }

    const currentTrack = PlayerController.getCurrentSubtitleTrack();
    const currentLang = currentTrack ? currentTrack.languageCode : null;
    if (currentLang && currentLang !== this.currentSubtitleLanguage) {
      Logger.info(`字幕言語が変更: ${this.currentSubtitleLanguage || 'none'} → ${currentLang}`);
      this.currentSubtitleLanguage = currentLang;
      this.captionBlocks = [];
      this.fetchErrorCount = 0;
      this.fetchBlocked = false;
      this.currentTrackIsTranslated = false;
      const tracks = PlayerController.getSubtitleTracks();
      this._reevaluateNativeSubtitleMode(tracks);
    }

    const captionWindow = document.querySelector(
      ".caption-window, .ytp-caption-window, .ytp-caption-window-top, .ytp-caption-window-bottom",
    );

    if (captionWindow && captionWindow !== this.currentCaptionWindow) {
      this.currentCaptionWindow = captionWindow;
    }

    if (this.isSubtitleEnabled) {
      const currentVid = getYouTubeVideoId();
      const blocksUsable = this.captionBlocks.length > 0 &&
        (!this.captionBlocksVideoId || this.captionBlocksVideoId === currentVid);
      if (blocksUsable) {
        // ブロックデータがある時は時間ベース表示（DOM監視を停止）
        this.hideOriginalCaptions(true);
        this.stopDomWatch();
        Logger.debug(`[checkState] ブロックベース表示: blocks=${this.captionBlocks.length}`);
        this.updateDisplayFromTime();
      } else {
        this.hideOriginalCaptions(true);
        Logger.debug(`[checkState] DOM監視フォールバック: captionBlocks=${this.captionBlocks.length}, isFetching=${this.isFetching}, fetchBlocked=${this.fetchBlocked}`);
        this.startDomWatch();
      }
      if (!blocksUsable && !this.isFetching && !this.fetchBlocked) {
        this.fetchSubtitles();
      }
    } else {
      this.currentCaptionWindow = null;
      this.hideOverlay();
      this.hideOriginalCaptions(false);
      this.stopDomWatch();
    }
  },

  startDomWatch() {
    if (!this.yseCaptionObserver || this.domWatchActive) return;
    const target = this.getCaptionWindow();
    if (!target) {
      // まだcaption windowが存在しない場合はコンテナを監視
      const container = document.querySelector(".ytp-caption-window-container");
      if (container) {
        this.yseCaptionObserver.observe(container, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        this.domWatchActive = true;
        Logger.debug("DOM監視を開始（コンテナ待機中）");
      }
      return;
    }
    this.yseCaptionObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.domWatchActive = true;
    Logger.debug("DOM監視を開始");
  },

  stopDomWatch() {
    if (this.yseCaptionObserver && this.domWatchActive) {
      this.yseCaptionObserver.disconnect();
      this.domWatchActive = false;
    }
  },

  // DOM監視（YouTubeの字幕ウィンドウを直接監視して表示）
  yseCaptionObserver: null,
  domWatchActive: false,
  domWatchLastText: "",
  domWatchTimer: null,

  setupDomWatch() {
    this.teardownDomWatch();
    this.yseCaptionObserver = new MutationObserver(() => {
      if (!this.isSubtitleEnabled) return;
      // デバウンス: 短時間の連続更新は最後の1回だけ処理
      if (this.domWatchTimer) clearTimeout(this.domWatchTimer);
      this.domWatchTimer = setTimeout(() => {
        this.domWatchTimer = null;
        const cw = this.getCaptionWindow();
        if (!cw) return;
        const segEls = cw.querySelectorAll('.ytp-caption-segment');
        const texts = [];
        for (const seg of segEls) {
          const t = (seg.textContent || '').trim();
          if (!t) continue;
          if (texts.length > 0 && texts[texts.length - 1] === t) continue;
          texts.push(t);
        }
        let text = texts.length > 0 ? joinCaptionSegments(texts) : (cw.textContent || '').trim();
        if (text && text !== this.domWatchLastText) {
          this.domWatchLastText = text;
          this.domWatchActive = true;
          const offset = Number(Settings.get("subtitleOffset")) || 0;
          if (offset > 0) {
            Logger.debug(`[DOM監視] 字幕を${offset}ms遅延して表示`);
            if (this._domWatchDisplayTimer) clearTimeout(this._domWatchDisplayTimer);
            this._domWatchDisplayTimer = setTimeout(() => {
              this._domWatchDisplayTimer = null;
              this.displaySentence(text);
            }, offset);
          } else {
            if (offset < 0) {
              Logger.warn(`[DOM監視] offset=${offset}ms: 字幕データ未取得のため「早く表示」はできません（DOM監視モードではYouTubeの字幕表示を待つ必要がある）`);
            }
            if (this._domWatchDisplayTimer) {
              clearTimeout(this._domWatchDisplayTimer);
              this._domWatchDisplayTimer = null;
            }
            this.displaySentence(text);
          }
        } else if (!text && this.domWatchLastText) {
          this.domWatchLastText = "";
          if (this._domWatchDisplayTimer) {
            clearTimeout(this._domWatchDisplayTimer);
            this._domWatchDisplayTimer = null;
          }
          this.hideOverlay();
        }
      }, 100);
    });
  },

  teardownDomWatch() {
    if (this.domWatchTimer) {
      clearTimeout(this.domWatchTimer);
      this.domWatchTimer = null;
    }
    if (this._domWatchDisplayTimer) {
      clearTimeout(this._domWatchDisplayTimer);
      this._domWatchDisplayTimer = null;
    }
    if (this.yseCaptionObserver) {
      this.yseCaptionObserver.disconnect();
      this.yseCaptionObserver = null;
    }
    this.domWatchActive = false;
    this.domWatchLastText = "";
  },

  getCaptionWindow() {
    const cw = document.querySelector(
      ".caption-window, .ytp-caption-window, .ytp-caption-window-top, .ytp-caption-window-bottom"
    );
    if (cw) {
      const style = window.getComputedStyle(cw);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return null;
      }
    }
    return cw;
  },

  async fetchSubtitles() {
    const videoId = new URLSearchParams(window.location.search).get("v");
    if (!videoId) return;

    // 同じ動画のブロックを既に持っている、またはfetch中なら何もしない
    if (
      this.captionBlocks.length > 0 &&
      (this.currentVideoId === videoId || this.captionBlocksVideoId === videoId)
    )
      return;
    if (this.isFetching) return;
    // PoT失敗が続いたらリトライしない（DOMフォールバックに任せる）
    if (this.fetchBlocked) return;

    // 前回の試行からのクールダウン（3秒〜最大10秒）
    const now = Date.now();
    const currentCooldown =
      this.fetchErrorCount === 0
        ? 0
        : Math.min(3000 * Math.pow(1.5, this.fetchErrorCount - 1), 10000);

    if (
      this.currentVideoId === videoId &&
      now - this.lastFetchTime < currentCooldown
    ) {
      return;
    }

    this.isFetching = true;
    this.lastFetchTime = now;

    if (this.currentVideoId !== videoId) {
      this.fetchErrorCount = 0;
      // 遷移直後にブリッジが傍受した字幕ブロックを消さない。
      // 別動画のデータが残っている場合のみ破棄する。
      if (shouldDiscardBlocksForVideo(this.captionBlocksVideoId, videoId)) {
        this.captionBlocks = [];
        this.captionBlocksVideoId = null;
      }
      this.currentSubtitleLanguage = null;
    }

    this.currentVideoId = videoId;

    Logger.info(`字幕データの取得を開始します (VideoId: ${videoId})`);

    const tracks = PlayerController.getSubtitleTracks();
    if (!tracks || tracks.length === 0) {
      Logger.warn(
        "字幕トラックが1つも見つかりませんでした。動画に字幕が提供されていない可能性があります。",
      );
      this.isFetching = false;
      return;
    }

    const preferredLang = Settings.get("preferredLanguage") || "ja";
    const autoTranslate = Settings.get("autoTranslateIfNotAvailable");

    Logger.debug(
      `言語設定 - 優先: ${preferredLang}, 自動翻訳: ${autoTranslate}`,
    );

    let targetTrack = tracks.find((t) =>
      t.languageCode.startsWith(preferredLang),
    );
    let needTranslation = false;

    if (!targetTrack && autoTranslate) {
      // 優先言語がない場合、ASR(自動生成)でないトラックを優先的に探し、無ければ最初のを採用
      targetTrack = tracks.find((t) => t.kind !== "asr") || tracks[0];
      needTranslation = true;
      Logger.info(
        `優先言語(${preferredLang})が見つからないため、自動翻訳を使用します。ソース言語: ${targetTrack.languageCode}`,
      );
    }

    if (!targetTrack) {
      Logger.warn("適切な字幕トラックを選択できませんでした。");
      this.isFetching = false;
      return;
    }

    let urlObj;
    try {
      urlObj = new URL(targetTrack.baseUrl);
      urlObj.searchParams.set("fmt", "json3");
      if (needTranslation) {
        urlObj.searchParams.set("tlang", preferredLang);
      }
    } catch (urlErr) {
      Logger.error("URLの構築に失敗しました:", urlErr);
      this.isFetching = false;
      return;
    }

    const url = urlObj.toString();

    try {
      Logger.info(
        `字幕取得リクエスト開始 (VideoId: ${videoId}, 言語: ${targetTrack.languageCode}${needTranslation ? " [翻訳あり]" : ""})`,
      );

      // MAINワールドのパッチ済み fetch を利用するため、ブリッジ経由でリクエスト
      const requestId = Date.now().toString() + Math.random().toString();

      const fetchBridge = new Promise((resolve, reject) => {
        const handler = (e) => {
          if (e.detail && e.detail.requestId === requestId) {
            document.removeEventListener("YSE_FETCH_RESPONSE", handler);
            if (e.detail.error) {
              reject(new Error(e.detail.error));
            } else {
              resolve(e.detail);
            }
          }
        };
        document.addEventListener("YSE_FETCH_RESPONSE", handler);
        document.dispatchEvent(
          new CustomEvent("YSE_FETCH_REQUEST", { detail: { url, requestId } }),
        );

        // タイムアウト設定
        setTimeout(() => {
          document.removeEventListener("YSE_FETCH_RESPONSE", handler);
          reject(new Error("Fetch request timeout"));
        }, 30000);
      });

      const response = await fetchBridge;

      Logger.debug(
        `Fetchステータス: ${response.status} ${response.statusText}`,
      );

      // HTTPステータスコードでレート制限を直接検出
      if (response.status === 429) {
        Logger.warn(
          "⚠️ YouTubeからアクセス制限（HTTP 429）を受けています。しばらく時間をおいてください。",
        );
        this.fetchErrorCount += 5;
        this.isFetching = false;
        return;
      }

      const text = response.text;
      Logger.debug(`受信データサイズ: ${text ? text.length : 0} バイト`);

      if (!text || text.trim() === "") {
        throw new Error(
          "サーバーからのレスポンスが空です。YouTube側で制限されている可能性があります。",
        );
      }

      // YouTubeの「Sorry...」ページを検出（HTML応答が返ってくる場合）
      if (text.trimStart().startsWith("<")) {
        const isRateLimit =
          text.includes("Sorry") || text.includes("unusual traffic");
        if (isRateLimit) {
          Logger.warn(
            "⚠️ YouTubeからアクセス制限（Sorryページ）を受けています。制限解除まで待機します（約60秒）。次の試行: " +
              new Date(
                Date.now() +
                  Math.min(
                    3000 * Math.pow(1.5, this.fetchErrorCount + 4),
                    30000,
                  ),
              ).toLocaleTimeString(),
          );
        } else {
          Logger.warn(
            "🔴 字幕データの代わりにHTMLが返されました。トラックのURLが無効な可能性があります。",
          );
        }
        this.fetchErrorCount += 5; // 長期バックオフを強制
        this.isFetching = false;
        return;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonError) {
        Logger.error(`JSONのパースに失敗しました: ${text.substring(0, 200)}`);
        throw jsonError;
      }

      if (!data || !data.events) {
        Logger.warn("受信した字幕データにeventsプロパティが含まれていません。");
        this.captionBlocks = [];
      } else {
        this.captionBlocks = this.parseJson3(data);
        this.captionBlocksVideoId = videoId;
        this.currentSubtitleLanguage = targetTrack.languageCode;
        this.currentTrackIsTranslated = needTranslation || (targetTrack.baseUrl && targetTrack.baseUrl.includes('tlang='));
        Logger.info(
          `字幕データの取得・解析が完了 (VideoId: ${videoId}, 言語: ${targetTrack.languageCode}${this.currentTrackIsTranslated ? ' [翻訳]' : ''}, ブロック数: ${this.captionBlocks.length})`,
        );
      }

      if (this.captionBlocks.length === 0) {
        this.fetchErrorCount++;
      } else {
        this.fetchErrorCount = 0;
      }
    } catch (e) {
      Logger.error(
        `字幕データの取得・解析中にエラーが発生しました: ${e.name} - ${e.message}`,
      );
      this.fetchErrorCount++;
      // PoT不在によるタイムアウト/空レスポンスが複数回続いたらリトライ停止
      if (
        this.fetchErrorCount >= 3 &&
        (e.message.includes("空です") || e.message.includes("timeout") || e.message.includes("Timeout"))
      ) {
        this.fetchBlocked = true;
        Logger.warn("字幕APIが利用できません。DOM監視に完全に切り替えます。");
      }
    } finally {
      this.isFetching = false;
    }
  },

  parseJson3(data) {
    if (!data || !data.events) return [];

    // まず全eventを正規化: 空行・空セグメントをスキップし、テキストと時間のリストを作る
    const rawLines = [];
    for (const ev of data.events) {
      if (!ev.segs) continue;
      const text = ev.segs
        .map((s) => normalizeCaptionNewlines(s.utf8 || ""))
        .join("");
      const trimmed = text.trim();
      if (!trimmed) continue;
      rawLines.push({
        text: trimmed,
        start: ev.tStartMs,
        dur: ev.dDurationMs || 2000,
      });
    }

    // 自動生成字幕はセグメントが重複して渡されることがある。
    // 完全に同一テキストの連続を除去する（最初の出現のみ保持）
    const deduped = [];
    for (const line of rawLines) {
      if (deduped.length > 0 && deduped[deduped.length - 1].text === line.text)
        continue;
      deduped.push(line);
    }

    // 文の結合: 句読点で終わるか、次の行が全く新しい内容のときに区切る
    const blocks = [];
    let accumulated = "";
    let blockStart = -1;
    let blockEnd = 0;
    // 同一ブロック内での重複テキスト蓄積を防止（非連続重複対策）
    let blockSeenTexts = new Set();
    // チャンクの累積位置と時刻（セグメント切り替えを実発話時刻に合わせるため）
    let blockMarks = [];

    // 蓄積テキスト内の最後の文末位置を返す（小数点の「.」は文末として扱わない）
    const findLastSentenceEnd = (text) => {
      for (let k = text.length - 1; k >= 0; k--) {
        const ch = text[k];
        if (ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?') return k;
        if (ch === '.') {
          const prev = text[k - 1] || '';
          const next = text[k + 1] || '';
          if (!(/\d/.test(prev) && /\d/.test(next))) return k;
        }
      }
      return -1;
    };

    for (let i = 0; i < deduped.length; i++) {
      const line = deduped[i];
      const startMs = line.start;
      const endMs = startMs + line.dur;

      if (blockStart === -1) blockStart = startMs;

      // テキストの末尾からゴミ（先頭句読点）を除いて蓄積
      const clean = line.text.replace(/^[。！？.!?\s]+/, "").trimStart();
      if (clean) {
        // 同一ブロック内で既に同じテキストが追加されていたらスキップ（ASR重複対策）
        if (blockSeenTexts.has(clean)) {
          blockEnd = endMs;
          continue;
        }
        blockSeenTexts.add(clean);
        // スペース区切り（英語等）か直結（日本語等）かを判断
        const needsSpace =
          accumulated.length > 0 &&
          /[a-zA-Z0-9,;]$/.test(accumulated) &&
          /^[a-zA-Z0-9]/.test(clean);
        accumulated += (needsSpace ? " " : "") + clean;
        blockMarks.push({ endPos: accumulated.length, t: startMs });
      }
      blockEnd = endMs;

      // 文末判定を強化: 句読点で終わるか、文字数が多すぎるか、次のラインとのギャップが大きいなら区切る
      const trimmedAcc = accumulated.trimEnd();
      const endsWithPunctuation = /[。！？.!?]$/.test(trimmedAcc);
      // 小数点誤認識防止：accumulatedが「数字.」で終わり、次のセグメントが数字で始まる場合は文末としない
      const hasTrailingDecimal = /\d\.$/.test(trimmedAcc);
      const nextStartsWithDigit = hasTrailingDecimal && i + 1 < deduped.length && /^\d/.test(deduped[i + 1].text);
      const sentenceCount = (trimmedAcc.match(/[。！？.!?]/g) || []).length;
      const charCount = trimmedAcc.length;
      const nextGap =
        i + 1 < deduped.length ? deduped[i + 1].start - endMs : Infinity;

      let shouldSplit = false;
      let splitAtPunct = 0;
      if (nextGap > 1200) {
        shouldSplit = true;
      } else if (endsWithPunctuation && !nextStartsWithDigit) {
        if (charCount >= 10 || sentenceCount >= 2) {
          shouldSplit = true;
        }
      } else if (charCount > 80) {
        // 文末が来ないまま長くなった場合、蓄積の途中に文末があればそこで区切る。
        // ブロック末尾で文が途中に切れて表示が一瞬で消える問題の対策
        // （例:「…5万8,990ドル（＋」で切れて「諸費用）というのは…」が次ブロックになる）
        const punctIdx = findLastSentenceEnd(trimmedAcc);
        if (punctIdx === -1) {
          // 文末が無い場合も、日本語なら文節境界で切る
          const phraseCut = findPhraseCutPosition(trimmedAcc, 80);
          if (phraseCut > 0) {
            splitAtPunct = phraseCut;
          } else {
            shouldSplit = true;
          }
        } else if (punctIdx < trimmedAcc.length - 1) {
          splitAtPunct = punctIdx + 1;
        } else {
          shouldSplit = true;
        }
      }

      if (shouldSplit || splitAtPunct > 0) {
        if (splitAtPunct > 0) {
          // 文末までの前半をブロック化し、残りは次ブロックの先頭に引き継ぐ
          const headText = trimmedAcc.slice(0, splitAtPunct).trim();
          if (headText) {
            blocks.push({
              start: blockStart,
              end: startMs,
              text: headText,
              marks: blockMarks
                .filter((m) => m.endPos <= splitAtPunct)
                .concat([{ endPos: splitAtPunct, t: startMs }]),
            });
          }
          const remainderRaw = accumulated.slice(splitAtPunct);
          const remainder = remainderRaw.trimStart();
          const leadTrim = remainderRaw.length - remainder.length;
          accumulated = remainder;
          blockStart = startMs;
          // 残り部分のマークは位置を詰めて引き継ぐ
          blockMarks = blockMarks
            .filter((m) => m.endPos > splitAtPunct)
            .map((m) => ({ endPos: Math.max(0, m.endPos - splitAtPunct - leadTrim), t: m.t }));
          blockMarks.unshift({ endPos: 0, t: startMs });
          // blockSeenTexts は残り部分の重複判定のためクリアしない
        } else {
          const finalText = accumulated.trim().replace(/^[。！？.!?\s]+/, "");
          if (finalText) {
            blocks.push({
              start: blockStart,
              end: blockEnd + 300,
              text: finalText,
              marks: blockMarks,
            });
          }
          accumulated = "";
          blockStart = -1;
          blockSeenTexts = new Set();
          blockMarks = [];
        }
      }
    }

    // 末尾の残りを追加
    if (accumulated.trim() && blockStart !== -1) {
      blocks.push({
        start: blockStart,
        end: blockEnd + 800,
        text: accumulated.trim().replace(/^[。！？.!?\s]+/, ""),
        marks: blockMarks,
      });
    }

    // 最低表示時間の保証: 実効表示（次のブロック開始で打ち切られる分を考慮）が
    // 短すぎるブロックは、近い方の隣接ブロックへテキストごと統合する。
    // 前後とも離れている孤立ブロックは表示時間を延長する。
    const MIN_DISPLAY_MS = 1200;
    const MERGE_GAP_MS = 2000;
    const joinTexts = (a, b) => {
      const needsSpace = /[a-zA-Z0-9,;:]$/.test(a) && /^[a-zA-Z0-9]/.test(b);
      return a + (needsSpace ? " " : "") + b;
    };
    let adjusted = true;
    while (adjusted && blocks.length > 1) {
      adjusted = false;
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const next = blocks[i + 1] || null;
        const effectiveEnd = next ? Math.min(b.end, next.start) : b.end;
        if (effectiveEnd - b.start >= MIN_DISPLAY_MS) continue;

        const prev = blocks[i - 1] || null;
        const prevGap = prev ? b.start - prev.end : Infinity;
        const nextGap = next ? next.start - b.end : Infinity;

        if (prev && prevGap <= MERGE_GAP_MS && prevGap <= nextGap) {
          prev.text = joinTexts(prev.text, b.text);
          prev.end = Math.max(prev.end, b.end);
          blocks.splice(i, 1);
        } else if (next && nextGap <= MERGE_GAP_MS) {
          next.text = joinTexts(b.text, next.text);
          next.start = Math.min(b.start, next.start);
          next.end = Math.max(b.end, next.end);
          blocks.splice(i, 1);
        } else {
          // 孤立した短いブロックは最低表示時間まで延長する
          b.end = b.start + MIN_DISPLAY_MS;
        }
        adjusted = true;
        break;
      }
    }

    return blocks;
  },

  updateDisplayFromTime() {
    if (!this.isSubtitleEnabled) return;
    // ネイティブ字幕モード中はオーバーレイを出さない（二重表示防止）
    if (this.nativeSubtitleMode) return;
    // ブロックデータがない時はDOM監視に任せる
    if (this.captionBlocks.length === 0) {
      return;
    }
    const currentVid = getYouTubeVideoId();
    if (this.captionBlocksVideoId && currentVid && this.captionBlocksVideoId !== currentVid) return;
    const video = document.querySelector("video");
    if (!video) return;
    const offset = Number(Settings.get("subtitleOffset")) || 0;
    const videoMs = video.currentTime * 1000;

    Logger.debug(`[タイミング調整] offset=${offset}ms, videoTime=${videoMs.toFixed(0)}ms, blocks=${this.captionBlocks.length}`);

    // ブロックの終端は末尾に余韻(+300/+800ms)を持たせており前後が重複するため、
    // 重複時はより新しい（startが遅い）ブロックを優先する
    let block = null;
    for (const b of this.captionBlocks) {
      if (videoMs >= b.start + offset && videoMs <= b.end + offset) block = b;
    }

    if (block) {
      if (this.currentSentence !== block.text) {
        this.currentSentence = block.text;
        Logger.debug(`[タイミング調整] 字幕表示: "${block.text.substring(0, 30)}..." (start=${block.start}, end=${block.end})`);
        this.displaySentence(block.text);
      } else if (this._currentSegments.length > 1) {
        // 経過時間に合ったセグメントへ更新する（再生速度に依存しない）
        this._applySegmentForTime(videoMs - offset);
      }
    } else {
      // 表示すべき字幕がない時間帯
      if (this.currentSentence !== "") {
        this.currentSentence = "";
        this._resetSegmentState();
        this.hideOverlay();
      }
    }
  },

  _setupResizeObserver() {
    if (this._resizeObserver) return;

    this._resizeObserver = new ResizeObserver(() => {
      if (this._pendingTruncationCheck) return;
      this._pendingTruncationCheck = true;
      requestAnimationFrame(() => {
        this._pendingTruncationCheck = false;
        if (this.currentSentence && this.isSubtitleEnabled) {
          const maxLines = Settings.get("maxLines");
          this.displaySentence(this.currentSentence, maxLines);
        }
      });
    });

    if (this.playerContainer) {
      this._resizeObserver.observe(this.playerContainer);
    }
  },

  _resetSegmentState() {
    this._currentSegments = [];
    this._segmentIndex = -1;
    this._segmentBlockStart = 0;
    this._segmentBlockEnd = 0;
    this._segmentStartTimes = null;
  },

  _isTextTruncated(element, maxLines) {
    if (!element || !element.parentElement) return false;

    const clone = element.cloneNode(true);
    const parentWidth = element.parentElement.clientWidth;
    clone.style.cssText = `
      position: absolute !important;
      visibility: hidden !important;
      display: block !important;
      width: ${parentWidth}px !important;
      font-size: ${getComputedStyle(element).fontSize} !important;
      line-height: ${getComputedStyle(element).lineHeight} !important;
      font-family: ${getComputedStyle(element).fontFamily} !important;
      word-break: keep-all !important;
      overflow: visible !important;
      white-space: normal !important;
    `;
    element.parentElement.appendChild(clone);
    const lineHeight = parseFloat(getComputedStyle(clone).lineHeight);
    const fullHeight = clone.scrollHeight;
    element.parentElement.removeChild(clone);

    if (!lineHeight || lineHeight <= 0) return false;
    const actualLines = Math.round(fullHeight / lineHeight);
    return actualLines > maxLines;
  },

  _splitIntoSegments(text, maxLines) {
    // 文字数ではなくBudouXの文節境界を優先して分割する
    // （maxLinesは呼び出し互換のため残している）
    return layoutSubtitleText(text, 40, "segments");
  },

  displaySentence(text, forcedMaxLines) {
    if (!this.yseOverlay) return;
    if (!this.isSubtitleEnabled || !text || !text.trim()) {
      this._resetSegmentState();
      this.hideOverlay();
      return;
    }

    this._setupResizeObserver();
    this._resetSegmentState();

    const maxLines = forcedMaxLines !== undefined ? forcedMaxLines : Settings.get("maxLines");

    const formatted = this.formatSubtitleText(text, maxLines);

    if (this.textElement) {
      safeSetInnerHTML(this.textElement, formatted);
    } else {
      safeSetInnerHTML(this.yseOverlay, formatted);
    }
    this.yseOverlay.style.setProperty("display", "block", "important");
    this.yseOverlay.style.removeProperty("visibility");
    this.yseOverlay.style.removeProperty("opacity");
    this.applyCustomStyles();

    requestAnimationFrame(() => {
      if (!this.isSubtitleEnabled) return;

      const truncated = this._isTextTruncated(this.textElement || this.yseOverlay, maxLines);
      if (truncated) {
        Logger.debug("字幕が省略されています。セグメントに分割して順次表示します");
        this._startSegmentDisplay(text, maxLines);
      }
    });

    Logger.debug("表示文:", text);
  },

  _startSegmentDisplay(text, maxLines) {
    this._resetSegmentState();

    const segments = this._splitIntoSegments(text, maxLines);
    if (segments.length <= 1) return;

    this._currentSegments = segments;

    const block = this.captionBlocks.find(
      (b) => this.currentSentence === b.text
    );
    if (block) {
      this._segmentBlockStart = block.start;
      this._segmentBlockEnd = block.end;
      this._segmentStartTimes = computeSegmentStartTimes(text, segments, block.marks);
    } else {
      this._segmentStartTimes = null;
    }

    const video = document.querySelector("video");
    const offset = Number(Settings.get("subtitleOffset")) || 0;
    this._applySegmentForTime((video ? video.currentTime * 1000 : 0) - offset);
  },

  // 経過時間に応じたセグメントを表示する。
  // タイマーではなくメディア時間で決めるため、再生速度・シーク・一時停止に追従する
  _applySegmentForTime(videoMs) {
    if (this._currentSegments.length <= 1) return;
    const idx =
      this._segmentStartTimes && this._segmentStartTimes.length === this._currentSegments.length
        ? getSegmentIndexFromStartTimes(videoMs, this._segmentStartTimes)
        : getSegmentIndexForTime(
            videoMs,
            this._segmentBlockStart,
            this._segmentBlockEnd,
            this._currentSegments.length
          );
    if (idx === this._segmentIndex) return;
    this._segmentIndex = idx;
    if (this.textElement) {
      safeSetInnerHTML(
        this.textElement,
        escapeCaptionHtml(this._currentSegments[idx].trim()).replace(/\n/g, "<br>")
      );
    }
  },

  formatSubtitleText(text, maxLines = 2) {
    const target = text.trim();
    if (!target) return "";

    // 文単位に分けたうえで、50文字を超える文はBudouXの文節境界で折る
    // （maxLinesは呼び出し互換のため残している）
    const lines = layoutSubtitleText(target, 50, "lines");
    return lines.map((line) => escapeCaptionHtml(line.trim())).join("<br>");
  },

  hideOverlay() {
    if (this.yseOverlay) {
      this.yseOverlay.style.setProperty("display", "none", "important");
      this.yseOverlay.style.setProperty("visibility", "hidden", "important");
      this.yseOverlay.style.setProperty("opacity", "0", "important");
      if (this.textElement) {
        this.textElement.textContent = "";
      } else {
        this.yseOverlay.textContent = "";
      }
    }
  },

  setupDrag() {
    const overlay = this.yseOverlay;

    overlay.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.dragStartY = e.clientY;

      const rect = overlay.getBoundingClientRect();
      const playerRect = this.playerContainer.getBoundingClientRect();
      this.overlayStartBottom = playerRect.bottom - rect.bottom;

      overlay.style.cursor = "grabbing";
      this.isCustomPosition = true;
      e.preventDefault();
      e.stopPropagation();
    });

    if (!this._dragMouseMoveHandler) {
      this._dragMouseMoveHandler = (e) => {
        if (!this.isDragging) return;
        const dy = e.clientY - this.dragStartY;

        const newBottom = this.overlayStartBottom - dy;

        overlay.style.bottom = `${newBottom}px`;
        overlay.style.top = "auto";
      };
      document.addEventListener("mousemove", this._dragMouseMoveHandler);
    }

    if (!this._dragMouseUpHandler) {
      this._dragMouseUpHandler = () => {
        if (this.isDragging) {
          this.isDragging = false;
          overlay.style.cursor = "grab";
        }
      };
      document.addEventListener("mouseup", this._dragMouseUpHandler);
    }

    overlay.addEventListener("dblclick", () => {
      this.isCustomPosition = false;
      overlay.style.bottom = "10%";
      overlay.style.top = "auto";
      Logger.info("字幕位置をリセットしました");
    });
  },

  applyCustomStyles() {
    if (!this.yseOverlay) return;

    const fontSize = Settings.get("fontSize");
    const fontColor = Settings.get("fontColor");
    const bgColor = Settings.get("backgroundColor");
    const fontFamily = Settings.get("fontFamily");
    const fontWeight = Settings.get("fontWeight");
    const textShadow = Settings.get("textShadow");
    const position = Settings.get("position");
    const customY = Settings.get("customPositionY");
    const maxLines = Settings.get("maxLines");
    const lineHeight = Settings.get("lineHeight");
    const letterSpacing = Settings.get("letterSpacing");
    const captionWidth = Settings.get("captionWidth");

    if (!this.isCustomPosition) {
      if (position === "top") {
        this.yseOverlay.style.bottom = "auto";
        this.yseOverlay.style.top = "10%";
      } else if (position === "custom") {
        this.yseOverlay.style.bottom = `${customY}%`;
        this.yseOverlay.style.top = "auto";
      } else {
        this.yseOverlay.style.bottom = "5%";
        this.yseOverlay.style.top = "auto";
      }

      this.yseOverlay.style.setProperty("left", "0", "important");
      this.yseOverlay.style.setProperty("right", "0", "important");
      this.yseOverlay.style.setProperty("margin-left", "auto", "important");
      this.yseOverlay.style.setProperty("margin-right", "auto", "important");
    }

    this.yseOverlay.style.setProperty(
      "font-size",
      `${fontSize}px`,
      "important",
    );
    this.yseOverlay.style.setProperty("color", fontColor, "important");
    this.yseOverlay.style.setProperty("background", bgColor, "important");
    this.yseOverlay.style.setProperty("text-shadow", textShadow, "important");
    this.yseOverlay.style.setProperty(
      "line-height",
      String(lineHeight),
      "important",
    );
    this.yseOverlay.style.setProperty(
      "letter-spacing",
      `${letterSpacing}px`,
      "important",
    );
    this.yseOverlay.style.setProperty("font-family", fontFamily, "important");

    this.yseOverlay.style.setProperty("font-weight", fontWeight, "important");
    this.yseOverlay.style.setProperty(
      "max-width",
      `${captionWidth}%`,
      "important",
    );
  },

  updateStyles() {
    if (this.nativeSubtitleMode) {
      this._applyNativeStyles();
      return;
    }
    this.isCustomPosition = false;
    if (this.yseOverlay) {
      this.yseOverlay.style.left = "0";
      this.yseOverlay.style.right = "0";
      this.yseOverlay.style.marginLeft = "auto";
      this.yseOverlay.style.marginRight = "auto";
    }
    this.applyCustomStyles();
  },

  hideOriginalCaptions(hide) {
    const container = document.querySelector(".ytp-caption-window-container");
    if (container) {
      if (hide) {
        container.style.setProperty(
          "display",
          "none",
          "important",
        );
      } else {
        // 強制表示を解除し、YouTube自身の表示制御に委ねる
        container.style.removeProperty("display");
      }
    }
  },

  cleanup() {
    this.currentSentence = "";
    this.currentCaptionWindow = null;
    this.isSubtitleEnabled = false;
    this.captionBlocks = [];
    this.captionBlocksVideoId = null;
    this.currentVideoId = null;
    this.currentSubtitleLanguage = null;
    this.currentTrackIsTranslated = false;
    // スタイル要素は_removeNativeStyles()で消えるため、フラグも戻す。
    // 戻さないと次のネイティブ動画でsetNativeSubtitleMode(true)が
    // 同一値ガードで早期returnし、スタイルが再適用されない。
    this.nativeSubtitleMode = false;
    this.isFetching = false;
    this.fetchBlocked = false;
    this.teardownDomWatch();
    this._resetSegmentState();
    this.hideOverlay();
    this.hideOriginalCaptions(false);

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this._videoElement && this._timeUpdateHandler) {
      this._videoElement.removeEventListener("timeupdate", this._timeUpdateHandler);
      this._videoElement = null;
    }

    if (this._navigateHandler) {
      document.removeEventListener("yt-navigate-finish", this._navigateHandler);
      this._navigateHandler = null;
    }

    if (this.yseOverlay) {
      this.yseOverlay.remove();
      this.yseOverlay = null;
      this.textElement = null;
    }

    this._removeNativeStyles();
    this._initialized = false;
    Logger.info("字幕エンハンサーをクリーンアップしました");
  },
};

/**
 * 字幕テキストを文節境界（BudouX）優先で改行・セグメント分割する。
 * BudouXが読み込まれていない場合は従来の句読点・文字数ヒューリスティックに
 * フォールバックする。
 *
 * @param {string} text 対象テキスト
 * @param {number} maxLen 1行（lines）または1セグメント（segments）の目安文字数
 * @param {'lines'|'segments'} mode
 * @returns {string[]} 行またはセグメントの配列（元テキストの連続した部分文字列）
 */
function layoutSubtitleText(text, maxLen = 50, mode = "lines") {
  const target = String(text || "").trim();
  if (!target) return [];

  const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
  const OPEN_BRACKETS = new Set(
    "（「『【〔〈《［｛".split("").concat(["(", "[", "\u007B"]),
  );
  const CLOSE_BRACKETS = new Set(
    "）」』】〕〉》］｝".split("").concat([")", "]", "\u007D"]),
  );
  // 行頭に来てはいけない文字（句読点・閉じ括弧）
  const NO_LINE_START = new Set(
    "、。，．,.!?！？:;：；…）」』】〕〉》］｝"
      .split("")
      .concat([")", "]", "\u007D"]),
  );
  // 行末に来てはいけない文字（開き括弧）
  const NO_LINE_END = OPEN_BRACKETS;

  const isJapanese = (value) => JAPANESE_RE.test(value);

  const isInsideBrackets = (value, pos) => {
    let depth = 0;
    for (let i = 0; i < pos; i++) {
      if (OPEN_BRACKETS.has(value[i])) depth++;
      else if (CLOSE_BRACKETS.has(value[i])) depth = Math.max(0, depth - 1);
    }
    return depth > 0;
  };

  const isSafeBreak = (value, pos) => {
    if (pos <= 0 || pos >= value.length) return false;
    const prev = value[pos - 1];
    const next = value[pos];
    // 禁則処理
    if (NO_LINE_START.has(next) || NO_LINE_END.has(prev)) return false;
    // 英単語・数値の途中では切らない
    if (/[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next)) return false;
    // 括弧・引用の内側では切らない
    if (isInsideBrackets(value, pos)) return false;
    return true;
  };

  const getPhraseBoundaries = (value) => {
    if (!isJapanese(value)) return [];
    const parser = typeof window !== "undefined" ? window.BudouX : null;
    if (!parser || typeof parser.parseBoundaries !== "function") return [];
    try {
      return parser
        .parseBoundaries(value)
        .filter((pos) => Number.isInteger(pos) && pos > 0 && pos < value.length);
    } catch (e) {
      return [];
    }
  };

  // 小数点・桁区切りの「.」「,」は文末・区切りとして扱わない
  const isDecimalPunctuation = (value, pos) => {
    const prev = value[pos - 2] || "";
    const next = value[pos] || "";
    return /[.,]/.test(value[pos - 1]) && /\d/.test(prev) && /\d/.test(next);
  };

  const splitSentences = (value) => {
    const sentences = [];
    let buffer = "";
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      buffer += char;
      if (!/[。！？.!?]/.test(char)) continue;
      // 「...」は文末ではなく間（ポーズ）として扱う
      if (char === "." && (value[i - 1] === "." || value[i + 1] === ".")) {
        continue;
      }
      const prevChar = i > 0 ? value[i - 1] : "";
      const nextChar = i + 1 < value.length ? value[i + 1] : "";
      const isDecimal =
        /\d/.test(prevChar) &&
        (/\d/.test(nextChar) ||
          (/\s/.test(nextChar) &&
            i + 2 < value.length &&
            /\d/.test(value[i + 2])));
      if (isDecimal) continue;
      sentences.push(buffer);
      buffer = "";
    }
    if (buffer) sentences.push(buffer);
    return sentences;
  };

  const splitBracketTag = (sentence) => {
    const match = sentence.match(/\[.*?\]/);
    if (!match) return [sentence];
    const before = sentence.slice(0, match.index).trim();
    const tag = match[0];
    const after = sentence.slice(match.index + tag.length).trim();
    return [before, tag, after].filter(Boolean);
  };

  const collectCandidates = (value, phraseBoundaries) => {
    const candidates = new Set(phraseBoundaries);
    for (let i = 1; i < value.length; i++) {
      const prev = value[i - 1];
      if (/[。、，！？!?.,;:…]/.test(prev) && !isDecimalPunctuation(value, i)) {
        // 省略記号は最後のドットの後だけ候補にする
        if (prev === ".") {
          const isEllipsisEnd = value[i - 2] === "." && value[i] !== ".";
          if (!isEllipsisEnd) continue;
        }
        candidates.add(i);
      }
      // 日本語混じりの文では英字スペースを優先候補にしない
      // （「iPhone 18 Pro Max」のような製品名の途中で切れないように）
      if (/\s/.test(value[i]) && !isJapanese(value)) candidates.add(i);
    }
    return [...candidates]
      .filter((pos) => isSafeBreak(value, pos))
      .sort((a, b) => a - b);
  };

  const chooseCut = (value, start, limit, candidates) => {
    const hardLimit = Math.min(value.length, start + limit);
    const softLimit = Math.min(
      value.length,
      start + Math.ceil(limit * 1.25),
    );
    let within = -1;
    let beyond = -1;
    for (const pos of candidates) {
      if (pos <= start) continue;
      if (pos <= hardLimit) {
        within = pos;
      } else {
        if (pos <= softLimit && beyond < 0) beyond = pos;
        break;
      }
    }
    // 極端に短い行になるくらいなら、少しはみ出しても文節境界を優先する
    if (beyond > 0 && (within < 0 || within - start < 10)) return beyond;
    return within;
  };

  const fallbackCut = (value, start, limit) => {
    const hardLimit = Math.min(value.length, start + limit);
    if (hardLimit <= start) return value.length;

    for (let i = hardLimit; i > start; i--) {
      if (/\s/.test(value[i])) return i;
    }
    for (let i = hardLimit; i > start + 1; i--) {
      const prevIsAlpha = /[A-Za-z]/.test(value[i - 1]);
      const currIsAlpha = /[A-Za-z]/.test(value[i]);
      if (prevIsAlpha !== currIsAlpha) return i;
    }
    for (let i = hardLimit; i > start + 1; i--) {
      if (isSafeBreak(value, i)) return i;
    }

    let cut = hardLimit;
    // サロゲートペアを分割しない
    if (/[\uD800-\uDBFF]/.test(value[cut - 1])) cut--;
    return Math.max(start + 1, cut);
  };

  const pushWrapped = (part, limit, out) => {
    if (!part) return;
    if (part.length <= limit) {
      out.push(part);
      return;
    }

    const candidates = collectCandidates(part, getPhraseBoundaries(part));
    let start = 0;
    let guard = 0;
    while (part.length - start > limit) {
      if (guard++ > 1000) break;
      let cut = chooseCut(part, start, limit, candidates);
      if (cut <= start) cut = fallbackCut(part, start, limit);
      if (cut <= start) cut = Math.min(part.length, start + limit);
      out.push(part.slice(start, cut));
      start = cut;
    }
    if (start < part.length) out.push(part.slice(start));
  };

  const out = [];
  for (const sentence of splitSentences(target)) {
    if (!sentence) continue;
    if (mode === "lines") {
      // 従来どおり [タグ] は独立した行にする
      for (const part of splitBracketTag(sentence)) {
        pushWrapped(part, maxLen, out);
      }
    } else {
      const before = out.length;
      pushWrapped(sentence, maxLen, out);
      // 長い一文の末尾が数文字だけになる場合、前の断片と結合して
      // 一瞬だけ表示されるセグメントを避ける
      if (out.length - before >= 2) {
        const last = out[out.length - 1];
        const prev = out[out.length - 2];
        if (
          last.length < 10 &&
          prev.length + last.length <= Math.ceil(maxLen * 1.25)
        ) {
          out.splice(out.length - 2, 2, prev + last);
        }
      }
    }
  }
  return out;
}

/**
 * 80文字超で文末が無いブロックを、日本語の文節境界で切る位置を返す。
 * BudouXが無い、または境界が見つからない場合は -1（従来動作）。
 */
function findPhraseCutPosition(text, maxLen) {
  const target = String(text || "").trimEnd();
  if (!target || !/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(target)) {
    return -1;
  }
  const parser = typeof window !== "undefined" ? window.BudouX : null;
  if (!parser || typeof parser.parseBoundaries !== "function") return -1;

  const parts = layoutSubtitleText(target, maxLen, "segments");
  if (parts.length < 2) return -1;
  // 極端に短いブロックを作らない
  if (parts[0].length < Math.floor(maxLen * 0.5)) return -1;
  if (parts[0].length >= target.length) return -1;
  return parts[0].length;
}

// 字幕セグメントの連結（CJKはスペースなし、英数字境界のみスペース）
function joinCaptionSegments(texts) {
  let out = '';
  for (const raw of texts) {
    const t = (raw || '').trim();
    if (!t) continue;
    if (!out) { out = t; continue; }
    if (out === t) continue;
    if (out.endsWith(t)) continue; // 末尾の重複（ローリング字幕）
    if (out.startsWith(t)) continue; // 先頭の重複（再掲）
    if (t.startsWith(out)) { out = t; continue; } // より長い後続で置換
    const needsSpace = /[A-Za-z0-9,;:]$/.test(out) && /^[A-Za-z0-9]/.test(t);
    out += (needsSpace ? ' ' : '') + t;
  }
  return out;
}

// 字幕データ内の改行を正規化（CJK間はスペースなし、英数字間はスペース）
function normalizeCaptionNewlines(text) {
  if (!text) return '';
  const isCJKChar = (ch) => /[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]/.test(ch);
  const hasCJK = isCJKChar(text);
  return text.replace(/([^\s])\n+([^\s])/g, (m, a, b) => {
    // CJK境界はスペースなしで連結
    if (isCJKChar(a) || isCJKChar(b)) return a + b;
    // CJK文脈内の英小文字同士は機械翻訳による語中分割とみなし、スペースなしで連結
    // （例: 新しいDownloa⏎d → 新しいDownload）
    if (hasCJK && /[a-z]/.test(a) && /[a-z]/.test(b)) return a + b;
    // それ以外（英文等）はスペースで連結
    return a + ' ' + b;
  });
}

// innerHTMLへ展開する字幕テキストのエスケープ
function escapeCaptionHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ブロック内の経過時間から表示すべきセグメントindexを求める。
// メディア時間ベースなので再生速度（playbackRate）・シーク・一時停止に追従する。
function getSegmentIndexForTime(videoMs, startMs, endMs, segmentCount) {
  if (!segmentCount || segmentCount <= 1) return 0;
  const duration = endMs - startMs;
  if (!(duration > 0)) return 0;
  const ratio = (videoMs - startMs) / duration;
  if (ratio <= 0) return 0;
  const idx = Math.floor(ratio * segmentCount);
  return idx >= segmentCount ? segmentCount - 1 : idx;
}

// ブロックが現在の動画と別動画のものかどうか（別動画のときだけ破棄する）
// 初回ロード直後の傍受データをnavigate-finishで消さないための判定
function shouldDiscardBlocksForVideo(blocksVideoId, currentVideoId) {
  return !!(blocksVideoId && currentVideoId && blocksVideoId !== currentVideoId);
}

// ブロックのチャンク時刻マークから、各セグメントの表示開始時刻を求める。
// 均等割りではなく実際のチャンク（発話）時刻に合わせるための変換。
function computeSegmentStartTimes(text, segments, marks) {
  if (!Array.isArray(marks) || marks.length === 0) return null;
  const times = [];
  let searchFrom = 0;
  for (const seg of segments) {
    const idx = text.indexOf(seg, searchFrom);
    const pos = idx >= 0 ? idx : searchFrom;
    let t = marks[marks.length - 1].t;
    for (const m of marks) {
      if (m.endPos > pos) {
        t = m.t;
        break;
      }
    }
    times.push(t);
    searchFrom = pos + seg.length;
  }
  return times;
}

// セグメント開始時刻リストから、現在時刻に表示すべきセグメントindexを求める
function getSegmentIndexFromStartTimes(videoMs, startTimes) {
  if (!Array.isArray(startTimes) || startTimes.length === 0) return 0;
  let idx = 0;
  for (let i = 0; i < startTimes.length; i++) {
    if (videoMs >= startTimes[i]) idx = i;
    else break;
  }
  return idx;
}

window.SubtitleEnhancer = SubtitleEnhancer;
window.joinCaptionSegments = joinCaptionSegments;
window.layoutSubtitleText = layoutSubtitleText;
window.findPhraseCutPosition = findPhraseCutPosition;
window.normalizeCaptionNewlines = normalizeCaptionNewlines;
window.escapeCaptionHtml = escapeCaptionHtml;
window.getSegmentIndexForTime = getSegmentIndexForTime;
window.computeSegmentStartTimes = computeSegmentStartTimes;
window.getSegmentIndexFromStartTimes = getSegmentIndexFromStartTimes;
window.shouldDiscardBlocksForVideo = shouldDiscardBlocksForVideo;
