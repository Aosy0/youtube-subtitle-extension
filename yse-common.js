// ============================================
// YouTube Subtitle Enhancer - 共通ユーティリティ
// ============================================

'use strict';

// ============================================
// 設定定数
// ============================================
const CONFIG = {
    VERSION: '1.1.1',
    STORAGE_KEY: 'yse_settings',
    DEFAULT_SETTINGS: {
        enabled: true,
        preferredLanguage: 'ja',
        fallbackLanguage: 'en',
        autoTranslateIfNotAvailable: true,
        subtitleOffset: 0,
        sentenceMode: true,
        fontSize: 24,
        fontFamily: '"Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif',
        fontColor: '#ffffff',
        fontWeight: 'normal',
        backgroundColor: 'rgba(0, 0, 0, 0.50)',
        textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
        position: 'bottom',
        customPositionY: 10,
        captionWidth: 80,
        maxLines: 2,
        lineHeight: 1.4,
        letterSpacing: 0.5
    }
};

// ============================================
// YouTube動画ID取得（watch/shorts/live/embed対応）
// ============================================
function getYouTubeVideoId(urlString) {
    try {
        const u = new URL(urlString || location.href, location.href);
        const v = u.searchParams.get('v');
        if (v) return v;
        const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/);
        if (m) return m[1];
        return null;
    } catch (_) {
        return null;
    }
}

// ============================================
// 設定管理（chrome.storage.local）
// ============================================
const Settings = {
    _cache: null,

    async init() {
        this._cache = await this._load();
        return this._cache;
    },

    _load() {
        return new Promise((resolve) => {
            chrome.storage.local.get([CONFIG.STORAGE_KEY], (result) => {
                const saved = result[CONFIG.STORAGE_KEY] || {};
                resolve({ ...CONFIG.DEFAULT_SETTINGS, ...saved });
            });
        });
    },

    get(key) {
        if (this._cache === null) {
            return CONFIG.DEFAULT_SETTINGS[key];
        }
        return this._cache[key];
    },

    async set(key, value) {
        if (this._cache === null) {
            this._cache = { ...CONFIG.DEFAULT_SETTINGS };
        }
        this._cache[key] = value;
        return new Promise((resolve) => {
            chrome.storage.local.set({ [CONFIG.STORAGE_KEY]: this._cache }, resolve);
        });
    },

    async reset() {
        this._cache = { ...CONFIG.DEFAULT_SETTINGS };
        return new Promise((resolve) => {
            chrome.storage.local.set({ [CONFIG.STORAGE_KEY]: this._cache }, resolve);
        });
    },

    getAll() {
        return this._cache || { ...CONFIG.DEFAULT_SETTINGS };
    }
};

// ============================================
// ロガー
// ============================================
const Logger = {
    _prefix: '[YSE]',
    _logLevel: 'info',

    _log(level, ...args) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        if (levels[level] >= levels[this._logLevel]) {
            const out = args.join(' ');
            console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
                this._prefix, out
            );
            if (typeof LogPanel !== 'undefined') {
                LogPanel._addLog(level, out);
            }
        }
    },

    debug(...args) { this._log('debug', ...args); },
    info(...args) { this._log('info', ...args); },
    warn(...args) { this._log('warn', ...args); },
    error(...args) { this._log('error', ...args); }
};

// ============================================
// ログパネル
// ============================================
const LogPanel = {
    _panel: null,
    _logContainer: null,
    _buffer: [],
    _maxBuffer: 500,

    init() {
        // Initialize if needed
        return this;
    },

    show() {
        if (this._panel) {
            this._panel.remove();
            this._panel = null;
            return;
        }

        this._panel = document.createElement('div');
        this._panel.id = 'yse-log-panel';
        this._panel.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 400px;
            max-height: 300px;
            background: rgba(0, 0, 0, 0.9);
            color: #0f0;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            border-radius: 8px;
            z-index: 10000;
            overflow-y: auto;
            border: 1px solid #333;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
        header.innerHTML = `
            <strong style="color: #fff;">YSE Log Panel</strong>
            <button id="yse-log-close" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Close</button>
        `;
        this._panel.appendChild(header);

        this._logContainer = document.createElement('div');
        this._logContainer.id = 'yse-log-container';
        this._panel.appendChild(this._logContainer);

        document.body.appendChild(this._panel);

        header.querySelector('#yse-log-close').addEventListener('click', () => {
            this._panel.remove();
            this._panel = null;
            this._logContainer = null;
        });

        // バッファに溜まっているログを再生
        this._flushBuffer();
        this._addLog('info', 'Log panel opened');
    },

    _addLog(level, ...args) {
        const line = `[${new Date().toLocaleTimeString()}] [${level.toUpperCase()}] ${args.join(' ')}`;
        if (this._logContainer) {
            const entry = document.createElement('div');
            entry.style.color = level === 'error' ? '#ff4444' : level === 'warn' ? '#ffaa00' : '#00ff00';
            entry.textContent = line;
            this._logContainer.appendChild(entry);
            const MAX_LOG_ENTRIES = 100;
            while (this._logContainer.children.length > MAX_LOG_ENTRIES) {
                this._logContainer.removeChild(this._logContainer.firstChild);
            }
            this._logContainer.scrollTop = this._logContainer.scrollHeight;
        } else {
            this._buffer.push(line);
            if (this._buffer.length > this._maxBuffer) {
                this._buffer.shift();
            }
        }
    },

    _flushBuffer() {
        if (!this._logContainer) return;
        for (const line of this._buffer) {
            const entry = document.createElement('div');
            entry.style.color = '#0f0';
            entry.textContent = line;
            this._logContainer.appendChild(entry);
        }
        const MAX_LOG_ENTRIES = 100;
        while (this._logContainer.children.length > MAX_LOG_ENTRIES) {
            this._logContainer.removeChild(this._logContainer.firstChild);
        }
        this._logContainer.scrollTop = this._logContainer.scrollHeight;
        this._buffer = [];
    }
};

// ============================================
// セーフHTML設定（XSS対策）
// ============================================
function safeSetInnerHTML(element, html) {
    element.innerHTML = html;
}

// グローバルに公開
window.CONFIG = CONFIG;
window.Settings = Settings;
window.Logger = Logger;
window.LogPanel = LogPanel;
window.safeSetInnerHTML = safeSetInnerHTML;
window.getYouTubeVideoId = getYouTubeVideoId;
