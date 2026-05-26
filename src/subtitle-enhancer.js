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
  currentVideoId: null,
  isFetching: false,
  lastFetchTime: 0,
  fetchErrorCount: 0,
  fetchBlocked: false,
  _listenersAttached: false,
  _interceptHandler: null,
  _navigateHandler: null,
  _timeUpdateHandler: null,
  _dragMouseMoveHandler: null,
  _dragMouseUpHandler: null,

  init() {
    this.createOverlay();
    this.startPolling();
    this.setupEventListeners();

    if (this._interceptHandler) {
      document.removeEventListener("YSE_INTERCEPTED_SUBTITLE", this._interceptHandler);
    }
    this._interceptHandler = (e) => {
      if (e.detail && e.detail.text) {
        Logger.info(`ブリッジからインターセプトされた字幕データを受信しました (${e.detail.text.length}バイト)`);
        try {
          const data = JSON.parse(e.detail.text);
          if (data && data.events) {
            this.captionBlocks = this.parseJson3(data);
            // ブロックデータが入ったらDOM監視を停止し時間ベース表示に切り替え
            this.stopDomWatch();
            Logger.info(
              `インターセプトした字幕の解析完了 (ブロック数: ${this.captionBlocks.length})`,
            );
          }
        } catch (err) {
          Logger.error("インターセプトしたデータのパースに失敗:", err);
        }
      }
    };
    document.addEventListener("YSE_INTERCEPTED_SUBTITLE", this._interceptHandler);

    // 表示遅延を無くすため、初期化時に字幕データを裏で事前取得しておく
    this.fetchSubtitles();

    // DOM監視（YouTubeの字幕ウィンドウを直接監視）
    this.setupDomWatch();

    Logger.info("字幕エンハンサーを初期化しました");
  },
  setupEventListeners() {
    if (this._navigateHandler) {
      document.removeEventListener("yt-navigate-finish", this._navigateHandler);
    }

    // 動画の再生時間更新に合わせて即座に字幕を更新する
    if (!this._timeUpdateHandler) {
      this._timeUpdateHandler = () => {
        if (this.isSubtitleEnabled) {
          this.updateDisplayFromTime();
        }
      };
    }

    const attachTimeUpdate = () => {
      const video = document.querySelector("video");
      if (video && !video.hasAttribute("data-yse-timeupdate")) {
        video.setAttribute("data-yse-timeupdate", "true");
        video.addEventListener("timeupdate", this._timeUpdateHandler);
      }
    };

    // 初回実行
    attachTimeUpdate();

    // ページ遷移（SPA）時に次の動画の取得準備とイベントリスナー再設定を行う
    this._navigateHandler = () => {
      // 状態をリセット
      this.currentVideoId = null;
      this.captionBlocks = [];
      this.currentSentence = "";
      this.isFetching = false;
      // 新しい動画の字幕を事前取得
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
            max-width: 80% !important;
            bottom: 10% !important;
            text-align: center !important;
            z-index: 40 !important;
            padding: 8px 16px !important;
            border-radius: 8px !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            line-height: 1.4 !important;
            letter-spacing: 0.5px !important;
            font-size: 24px !important;
            color: #ffffff !important;
            background: rgba(0, 0, 0, 0.50) !important;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8) !important;
            display: none !important;
            overflow: hidden !important;
            font-family: "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif !important;
            cursor: grab !important;
            user-select: none !important;
            pointer-events: auto !important;
        `;

    this.textElement = document.createElement("div");
    this.textElement.className = "yse-caption-text";
    this.textElement.style.cssText = `
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
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

    const captionWindow = document.querySelector(
      ".caption-window, .ytp-caption-window, .ytp-caption-window-top, .ytp-caption-window-bottom",
    );

    if (captionWindow && captionWindow !== this.currentCaptionWindow) {
      this.currentCaptionWindow = captionWindow;
    }

    if (this.isSubtitleEnabled) {
      this.hideOriginalCaptions(true);
      if (this.captionBlocks.length > 0) {
        // ブロックデータがある時は時間ベース表示（DOM監視を停止）
        this.stopDomWatch();
        this.updateDisplayFromTime();
      } else {
        // ブロックデータがない時はDOM監視でYouTubeの表示を直接読む
        this.startDomWatch();
      }
      if (this.captionBlocks.length === 0 && !this.isFetching && !this.fetchBlocked) {
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
        const segments = cw.querySelectorAll(
          "span, .ytp-caption-segment, .caption-line"
        );
        let text = "";
        if (segments.length > 0) {
          const texts = [];
          for (const seg of segments) {
            const t = (seg.textContent || "").trim();
            if (t) texts.push(t);
          }
          text = texts.join(" ");
        } else {
          text = (cw.textContent || "").trim();
        }
        if (text && text !== this.domWatchLastText) {
          this.domWatchLastText = text;
          this.domWatchActive = true;
          this.displaySentence(text);
        } else if (!text && this.domWatchLastText) {
          this.domWatchLastText = "";
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
    if (this.yseCaptionObserver) {
      this.yseCaptionObserver.disconnect();
      this.yseCaptionObserver = null;
    }
    this.domWatchActive = false;
    this.domWatchLastText = "";
  },

  getCaptionWindow() {
    return document.querySelector(
      ".caption-window, .ytp-caption-window, .ytp-caption-window-top, .ytp-caption-window-bottom"
    );
  },

  async fetchSubtitles() {
    const videoId = new URLSearchParams(window.location.search).get("v");
    if (!videoId) return;

    // 同じ動画で既に取得済み、またはfetch中なら何もしない
    if (this.currentVideoId === videoId && this.captionBlocks.length > 0)
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
      this.captionBlocks = [];
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
        Logger.info(
          `字幕データの取得・解析が完了しました (VideoId: ${videoId}, ブロック数: ${this.captionBlocks.length})`,
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
        .map((s) => (s.utf8 || "").replace(/\n/g, " "))
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

    for (let i = 0; i < deduped.length; i++) {
      const line = deduped[i];
      const startMs = line.start;
      const endMs = startMs + line.dur;

      if (blockStart === -1) blockStart = startMs;

      // テキストの末尾からゴミ（先頭句読点）を除いて蓄積
      const clean = line.text.replace(/^[。！？.!?\s]+/, "").trimStart();
      if (clean) {
        // スペース区切り（英語等）か直結（日本語等）かを判断
        const needsSpace =
          accumulated.length > 0 &&
          /[a-zA-Z0-9,;]$/.test(accumulated) &&
          /^[a-zA-Z0-9]/.test(clean);
        accumulated += (needsSpace ? " " : "") + clean;
      }
      blockEnd = endMs;

      // 文末判定を強化: 句読点で終わるか、文字数が多すぎるか、次のラインとのギャップが大きいなら区切る
      const trimmedAcc = accumulated.trimEnd();
      const endsWithPunctuation = /[。！？.!?]$/.test(trimmedAcc);
      const sentenceCount = (trimmedAcc.match(/[。！？.!?]/g) || []).length;
      const charCount = trimmedAcc.length;
      const nextGap =
        i + 1 < deduped.length ? deduped[i + 1].start - endMs : Infinity;

      let shouldSplit = false;
      if (nextGap > 800) {
        shouldSplit = true;
      } else if (endsWithPunctuation) {
        if (charCount > 20 || sentenceCount >= 2) {
          shouldSplit = true;
        }
      } else if (charCount > 25) {
        shouldSplit = true;
      }

      if (shouldSplit) {
        const finalText = accumulated.trim().replace(/^[。！？.!?\s]+/, "");
        if (finalText) {
          blocks.push({
            start: blockStart,
            end: blockEnd + 300,
            text: finalText,
          });
        }
        accumulated = "";
        blockStart = -1;
      }
    }

    // 末尾の残りを追加
    if (accumulated.trim() && blockStart !== -1) {
      blocks.push({
        start: blockStart,
        end: blockEnd + 800,
        text: accumulated.trim().replace(/^[。！？.!?\s]+/, ""),
      });
    }

    return blocks;
  },

  updateDisplayFromTime() {
    if (this.isFetching) return;
    if (!this.isSubtitleEnabled) return;
    // ブロックデータがない時はDOM監視に任せる
    if (this.captionBlocks.length === 0) {
      return;
    }
    const video = document.querySelector("video");
    if (!video) return;
    const currentMs = video.currentTime * 1000;

    const block = this.captionBlocks.find(
      (b) => currentMs >= b.start && currentMs <= b.end,
    );

    if (block) {
      if (this.currentSentence !== block.text) {
        this.currentSentence = block.text;
        this.displaySentence(block.text);
      }
    } else {
      // 表示すべき字幕がない時間帯
      if (this.currentSentence !== "") {
        this.currentSentence = "";
        this.hideOverlay();
      }
    }
  },

    displaySentence(text) {
    if (!this.yseOverlay) return;
    if (!this.isSubtitleEnabled || !text || !text.trim()) {
      this.hideOverlay();
      return;
    }

    const maxLines = Settings.get("maxLines");
    const formatted = this.formatSubtitleText(text, maxLines);
    const lineCount = formatted.split("<br>").length;

    if (this.textElement) {
      safeSetInnerHTML(this.textElement, formatted);
    } else {
      safeSetInnerHTML(this.yseOverlay, formatted);
    }
    this.yseOverlay.style.setProperty("display", "block", "important");
    this.yseOverlay.style.removeProperty("visibility");
    this.yseOverlay.style.removeProperty("opacity");
    this.applyCustomStyles();

    if (this.textElement) {
      this.textElement.style.setProperty(
        "-webkit-line-clamp",
        String(Math.min(lineCount, Math.max(maxLines, 1))),
        "important",
      );
    }

    Logger.debug("表示文:", text);
  },

  formatSubtitleText(text, maxLines = 2) {
    const target = text.trim();
    if (!target) return "";

    const punkt = /[。！？.!?]/;
    const hasPunctuation = punkt.test(target);

    if (!hasPunctuation) {
      return target;
    }

    const MAX_LEN = 20;
    const sentences = [];
    let buffer = "";
    for (const char of target) {
      buffer += char;
      if (punkt.test(char)) {
        sentences.push(buffer);
        buffer = "";
      }
    }
    if (buffer) sentences.push(buffer);

    const lines = [];
    for (const sentence of sentences) {
      const bracketMatch = sentence.match(/\[.*?\]/);
      if (bracketMatch) {
        const before = sentence.slice(0, bracketMatch.index);
        const tag = bracketMatch[0];
        const after = sentence.slice(bracketMatch.index + tag.length);
        if (before.trim()) lines.push(before.trim());
        lines.push(tag);
        if (after.trim()) lines.push(after.trim());
      } else if (sentence.length <= MAX_LEN) {
        lines.push(sentence);
      } else {
        for (let i = 0; i < sentence.length; i += MAX_LEN) {
          lines.push(sentence.slice(i, i + MAX_LEN));
        }
      }
    }

    if (lines.length > maxLines) {
      return lines.join("");
    }

    return lines.join("<br>");
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
    const textShadow = Settings.get("textShadow");
    const position = Settings.get("position");
    const customY = Settings.get("customPositionY");
    const maxLines = Settings.get("maxLines");
    const lineHeight = Settings.get("lineHeight");
    const letterSpacing = Settings.get("letterSpacing");

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
    if (this.textElement) {
      this.textElement.style.setProperty(
        "-webkit-line-clamp",
        String(maxLines),
        "important",
      );
    }
  },

  updateStyles() {
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
      container.style.setProperty(
        "display",
        hide ? "none" : "block",
        "important",
      );
    }
  },

  cleanup() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.currentSentence = "";
    this.currentCaptionWindow = null;
    this.isSubtitleEnabled = false;
    this.captionBlocks = [];
    this.currentVideoId = null;
    this.isFetching = false;
    this.fetchBlocked = false;
    this.teardownDomWatch();
    this.hideOverlay();
    this.hideOriginalCaptions(false);

    if (this._interceptHandler) {
      document.removeEventListener("YSE_INTERCEPTED_SUBTITLE", this._interceptHandler);
      this._interceptHandler = null;
    }

    if (this._navigateHandler) {
      document.removeEventListener("yt-navigate-finish", this._navigateHandler);
      this._navigateHandler = null;
    }

    if (this._timeUpdateHandler) {
      const video = document.querySelector("video");
      if (video) {
        video.removeEventListener("timeupdate", this._timeUpdateHandler);
        video.removeAttribute("data-yse-timeupdate");
      }
      this._timeUpdateHandler = null;
    }

    if (this._dragMouseMoveHandler) {
      document.removeEventListener("mousemove", this._dragMouseMoveHandler);
      this._dragMouseMoveHandler = null;
    }

    if (this._dragMouseUpHandler) {
      document.removeEventListener("mouseup", this._dragMouseUpHandler);
      this._dragMouseUpHandler = null;
    }

    if (this.yseOverlay) {
      this.yseOverlay.remove();
      this.yseOverlay = null;
      this.textElement = null;
    }
    Logger.info("字幕エンハンサーをクリーンアップしました");
  },
};

window.SubtitleEnhancer = SubtitleEnhancer;
