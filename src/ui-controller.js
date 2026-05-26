// ============================================
// UI制御モジュール（設定パネル）
// ============================================
const UIController = {
    panel: null,
    isOpen: false,
    _initialized: false,
    _keydownHandler: null,

    init() {
        if (this._initialized) {
            Logger.debug('UIコントローラーは既に初期化済みです');
            return;
        }
        this._initialized = true;
        this.setupKeyboardShortcuts();
        YouTubeSettingsIntegration.init();
        Logger.info('UIコントローラーを初期化しました');
    },

    setupKeyboardShortcuts() {
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
        }
        this._keydownHandler = (e) => {
            if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.toggleSettings();
            }
        };
        document.addEventListener('keydown', this._keydownHandler);
    },

    cleanup() {
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        this.closeSettings();
        this._initialized = false;
        Logger.info('UIコントローラーをクリーンアップしました');
    },

    setupKeyboardShortcuts() {
        if (this._keyboardHandler) return;
        this._keyboardHandler = (e) => {
            if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.toggleSettings();
            }
        };
        document.addEventListener('keydown', this._keyboardHandler);
    },

    toggleSettings() {
        if (this.isOpen) {
            this.closeSettings();
        } else {
            this.openSettings();
        }
    },

    openSettings() {
        if (this.panel) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'yse-settings-overlay';
        this.overlay.addEventListener('click', () => this.closeSettings());
        document.body.appendChild(this.overlay);

        this.panel = document.createElement('div');
        this.panel.className = 'yse-settings-panel';
        safeSetInnerHTML(this.panel, this.generateSettingsHTML());

        this.panel.style.opacity = '0';
        this.panel.style.transform = 'translate(-50%, -45%)';

        document.body.appendChild(this.panel);
        this.isOpen = true;

        requestAnimationFrame(() => {
            this.panel.style.transition = 'opacity 0.2s, transform 0.2s';
            this.panel.style.opacity = '1';
            this.panel.style.transform = 'translate(-50%, -50%)';
        });

        this.attachEventListeners();
        Logger.debug('設定パネルを開きました');
    },

    closeSettings() {
        if (this.panel) {
            this.panel.style.opacity = '0';
            this.panel.style.transform = 'translate(-50%, -45%)';

            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }

            setTimeout(() => {
                if (this.panel) {
                    this.panel.remove();
                    this.panel = null;
                    this.isOpen = false;
                }
            }, 200);

            if (this._escHandler) {
                document.removeEventListener('keydown', this._escHandler);
                this._escHandler = null;
            }

            Logger.debug('設定パネルを閉じました');
        }
    },

    generateSettingsHTML() {
        const pos = Settings.get('position');
        const isEnabled = Settings.get('enabled') !== false;
        return `
            <div class="yse-settings-header">
                <h2 class="yse-settings-title">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 8px;">
                        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/>
                    </svg>
                    字幕設定（拡張）
                </h2>
                <button class="yse-settings-close" title="閉じる">&times;</button>
            </div>

            <div style="max-height: 60vh; overflow-y: auto; padding-right: 8px;">
                <div class="yse-setting-group" data-enabled-container style="background: ${isEnabled ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)'}; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <label class="yse-setting-checkbox" style="display: flex; align-items: center; gap: 12px;">
                        <input type="checkbox" data-key="enabled" ${isEnabled ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
                        <span data-enabled-label style="font-size: 16px; font-weight: bold; color: ${isEnabled ? '#4caf50' : '#f44336'};">拡張機能: ${isEnabled ? 'ON' : 'OFF'}</span>
                    </label>
                    <small style="color: #888; font-size: 12px; display: block; margin-top: 8px; padding-left: 32px;">
                        OFFにすると字幕表示干预を停止します（YouTube本身的字幕は引き続き表示）
                    </small>
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">優先言語 (ISO 639-1)</label>
                    <input type="text" class="yse-setting-input" data-key="preferredLanguage" value="${Settings.get('preferredLanguage')}" placeholder="例: ja, en, ko">
                    <small style="color: #888; font-size: 12px;">日本語の場合は「ja」を入力</small>
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">フォールバック言語</label>
                    <input type="text" class="yse-setting-input" data-key="fallbackLanguage" value="${Settings.get('fallbackLanguage')}" placeholder="例: en">
                    <small style="color: #888; font-size: 12px;">優先言語がない場合に使用</small>
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-checkbox">
                        <input type="checkbox" data-key="autoTranslateIfNotAvailable" ${Settings.get('autoTranslateIfNotAvailable') ? 'checked' : ''}>
                        <span>字幕がない場合は自動翻訳を使用</span>
                    </label>
                </div>

                <div style="border-top: 1px solid #444; margin: 16px 0;"></div>

                <div class="yse-setting-group">
                    <label class="yse-setting-checkbox">
                        <input type="checkbox" data-key="sentenceMode" ${Settings.get('sentenceMode') ? 'checked' : ''}>
                        <span>文単位で表示（自動生成字幕を改善）</span>
                    </label>
                    <small style="color: #888; font-size: 12px; display: block; margin-top: 4px; padding-left: 26px;">
                        1文字ずつの表示を文単位にまとめます
                    </small>
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">フォントサイズ: <span id="fontSize-value">${Settings.get('fontSize')}</span>px</label>
                    <div class="yse-range-container">
                        <input type="range" class="yse-setting-range" data-key="fontSize" value="${Settings.get('fontSize')}" min="12" max="48">
                        <span class="yse-range-value">${Settings.get('fontSize')}px</span>
                    </div>
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">フォントファミリー</label>
                    <select class="yse-setting-select" data-key="fontFamily">
                        <option value='"Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif' ${Settings.get('fontFamily').includes('Noto') ? 'selected' : ''}>標準 (Noto Sans JP / ゴシック)</option>
                        <option value='"MS PGothic", "MS UI Gothic", sans-serif' ${Settings.get('fontFamily').includes('PGothic') ? 'selected' : ''}>MS Pゴシック</option>
                        <option value='"HGS創英角丸ゴシックUB", "M PLUS Rounded 1c", sans-serif' ${Settings.get('fontFamily').includes('Rounded') ? 'selected' : ''}>丸ゴシック</option>
                        <option value='"UD デジタル 教科書体 N-R", "Klee One", serif' ${Settings.get('fontFamily').includes('UD') ? 'selected' : ''}>教科書体・手書き風</option>
                        <option value='"Yu Mincho", "MS PMincho", serif' ${Settings.get('fontFamily').includes('Mincho') ? 'selected' : ''}>明朝体</option>
                        <option value='Arial, Helvetica, sans-serif' ${Settings.get('fontFamily').includes('Arial') ? 'selected' : ''}>欧文 (Arial等)</option>
                    </select>
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">フォントカラー</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="color" class="yse-setting-input" data-key="fontColor" value="${Settings.get('fontColor')}" style="width: 60px; height: 36px; padding: 2px;">
                        <input type="text" class="yse-setting-input" data-key="fontColor" value="${Settings.get('fontColor')}" style="flex: 1;">
                    </div>
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">背景色</label>
                    <input type="text" class="yse-setting-input" data-key="backgroundColor" value="${Settings.get('backgroundColor')}" placeholder="rgba(0, 0, 0, 0.50)">
                    <small style="color: #888; font-size: 12px;">例: rgba(0, 0, 0, 0.50) または #000000cc</small>
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">字幕位置</label>
                    <select class="yse-setting-select" data-key="position">
                        <option value="bottom" ${pos === 'bottom' ? 'selected' : ''}>下部（デフォルト）</option>
                        <option value="top" ${pos === 'top' ? 'selected' : ''}>上部</option>
                        <option value="custom" ${pos === 'custom' ? 'selected' : ''}>カスタム位置</option>
                    </select>
                </div>

                <div class="yse-setting-group" id="customPositionGroup" style="display: ${pos === 'custom' ? 'block' : 'none'};">
                    <label class="yse-setting-label">下端からの距離: <span id="customPositionY-value">${Settings.get('customPositionY')}</span>%</label>
                    <div class="yse-range-container">
                        <input type="range" class="yse-setting-range" data-key="customPositionY" value="${Settings.get('customPositionY')}" min="0" max="50">
                        <span class="yse-range-value">${Settings.get('customPositionY')}%</span>
                    </div>
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">最大行数</label>
                    <input type="number" class="yse-setting-input" data-key="maxLines" value="${Settings.get('maxLines')}" min="1" max="5">
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">行の高さ</label>
                    <input type="number" class="yse-setting-input" data-key="lineHeight" value="${Settings.get('lineHeight')}" min="1" max="3" step="0.1">
                </div>

                <div class="yse-setting-group">
                    <label class="yse-setting-label">文字間隔 (px)</label>
                    <input type="number" class="yse-setting-input" data-key="letterSpacing" value="${Settings.get('letterSpacing')}" min="0" max="5" step="0.5">
                </div>
            </div>

            <div class="yse-settings-buttons">
                <button class="yse-btn yse-btn-primary" id="yse-save">保存して閉じる</button>
                <button class="yse-btn yse-btn-secondary" id="yse-cancel">キャンセル</button>
            </div>

            <div class="yse-debug-info">
                <div>Version: ${CONFIG.VERSION} | Alt+S でショートカット</div>
                <button id="yse-open-logpanel" style="
                    margin-top: 8px;
                    background: #3ea6ff;
                    border: none;
                    color: #000;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                ">ログパネルを開く (Ctrl+Shift+L)</button>
            </div>
        `;
    },

    attachEventListeners() {
        this.panel.querySelector('.yse-settings-close').addEventListener('click', () => {
            this.closeSettings();
        });

        this.panel.querySelector('#yse-save').addEventListener('click', () => {
            this.saveSettings();
            this.closeSettings();
        });

        this.panel.querySelector('#yse-cancel').addEventListener('click', () => {
            this.closeSettings();
        });

        this.panel.querySelectorAll('.yse-setting-input, .yse-setting-checkbox input, .yse-setting-select, .yse-setting-range').forEach(input => {
            if (input.type === 'range') {
                input.addEventListener('input', (e) => {
                    const key = e.target.dataset.key;
                    const value = parseInt(e.target.value, 10);
                    const valueDisplay = this.panel.querySelector(`#${key}-value`);
                    if (valueDisplay) {
                        valueDisplay.textContent = value;
                    }
                    const rangeValue = this.panel.querySelector('.yse-range-value');
                    if (rangeValue) {
                        rangeValue.textContent = key === 'customPositionY' ? value + '%' : value + 'px';
                    }
                    Settings.set(key, value);
                    SubtitleEnhancer.updateStyles();
                });
            }

            input.addEventListener('change', async (e) => {
                const key = e.target.dataset.key;
                let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

                if (e.target.type === 'number') {
                    value = parseFloat(e.target.value);
                }

                await Settings.set(key, value);
                SubtitleEnhancer.updateStyles();

                if (key === 'enabled') {
                    const label = this.panel.querySelector('span[data-enabled-label]');
                    if (label) {
                        label.textContent = value ? 'ON' : 'OFF';
                        label.style.color = value ? '#4caf50' : '#f44336';
                    }
                    const container = this.panel.querySelector('[data-enabled-container]');
                    if (container) {
                        container.style.background = value ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)';
                    }
                }

                if (key === 'position') {
                    const customGroup = this.panel.querySelector('#customPositionGroup');
                    if (customGroup) {
                        customGroup.style.display = value === 'custom' ? 'block' : 'none';
                    }
                }
            });
        });

        this.panel.addEventListener('click', (e) => {
            if (e.target === this.panel) {
                this.closeSettings();
            }
        });

        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeSettings();
            }
        };
        document.addEventListener('keydown', this._escHandler);

        const logPanelBtn = this.panel.querySelector('#yse-open-logpanel');
        if (logPanelBtn) {
            logPanelBtn.addEventListener('click', () => {
                LogPanel.show();
            });
        }
    },

    saveSettings() {
        Logger.info('設定を保存しました');
    }
};

window.UIController = UIController;
