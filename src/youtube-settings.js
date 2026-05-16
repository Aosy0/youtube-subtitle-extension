// ============================================
// YouTube設定メニュー統合モジュール
// ============================================
const YouTubeSettingsIntegration = {
    _menuObserver: null,

    init() {
        this._observeMenu();
        Logger.info('YouTube設定メニュー統合を初期化しました');
    },

    _observeMenu() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && node.classList &&
                        (node.classList.contains('ytp-popup') || node.classList.contains('ytp-settings-menu'))) {
                        this._enhanceMenu(node);
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
            const closeBtn = menu.querySelector('.ytp-panel-close-button');
            if (closeBtn) closeBtn.click();
        });

        panel.appendChild(item);
    }
};

window.YouTubeSettingsIntegration = YouTubeSettingsIntegration;
