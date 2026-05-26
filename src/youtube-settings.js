// ============================================
// YouTube設定メニュー統合モジュール
// ============================================
const YouTubeSettingsIntegration = {
    _menuObserver: null,
    _popupObserver: null,

    init() {
        if (this._menuObserver) {
            this._menuObserver.disconnect();
            this._menuObserver = null;
        }
        if (this._popupObserver) {
            this._popupObserver.disconnect();
            this._popupObserver = null;
        }
        this._observeMenu();
        Logger.info('YouTube設定メニュー統合を初期化しました');
    },

    _observeMenu() {
        const popup = document.querySelector('.ytp-settings-menu');
        if (popup) {
            this._enhanceMenu(popup);
            this._observePopup(popup);
        }

        if (this._menuObserver) {
            this._menuObserver.disconnect();
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1 || !node.classList) continue;
                    let target = null;
                    if (node.classList.contains('ytp-settings-menu')) {
                        target = node;
                    } else if (node.classList.contains('ytp-popup')) {
                        target = node.querySelector('.ytp-settings-menu');
                    }
                    if (target) {
                        this._enhanceMenu(target);
                        this._observePopup(target);
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this._menuObserver = observer;
    },

    _observePopup(popup) {
        if (popup._yseObserved) return;
        popup._yseObserved = true;

        if (this._popupObserver) {
            this._popupObserver.disconnect();
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    if (popup.style.display !== 'none') {
                        this._enhanceMenu(popup);
                    }
                }
            }
        });

        observer.observe(popup, {
            attributes: true,
            attributeFilter: ['style']
        });

        this._popupObserver = observer;
    },

    _enhanceMenu(menu) {
        if (menu.querySelector('.yse-menu-item')) return;

        const panel = menu.querySelector('.ytp-panel-menu');
        if (!panel) return;

        const item = document.createElement('div');
        item.className = 'ytp-menuitem yse-menu-item';
        item.setAttribute('role', 'menuitem');
        item.innerHTML = `
            <div class="ytp-menuitem-icon" style="display: flex; align-items: center; justify-content: center;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/>
                </svg>
            </div>
            <div class="ytp-menuitem-label">字幕設定（拡張）</div>
            <div class="ytp-menuitem-content"></div>
        `;

        item.addEventListener('click', () => {
            if (typeof UIController !== 'undefined') {
                UIController.openSettings();
            }
        });

        panel.appendChild(item);
        Logger.debug('拡張設定メニュー項目を追加しました');
    }
};

window.YouTubeSettingsIntegration = YouTubeSettingsIntegration;
