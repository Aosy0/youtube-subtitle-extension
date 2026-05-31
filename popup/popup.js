document.addEventListener('DOMContentLoaded', async () => {
    const settings = await loadSettings();

    const enabled = document.getElementById('enabled');
    const preferredLanguage = document.getElementById('preferredLanguage');
    const fallbackLanguage = document.getElementById('fallbackLanguage');
    const autoTranslate = document.getElementById('autoTranslateIfNotAvailable');
    const fontSize = document.getElementById('fontSize');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const captionWidth = document.getElementById('captionWidth');
    const captionWidthValue = document.getElementById('captionWidthValue');
    const fontWeight = document.getElementById('fontWeight');
    const fontColor = document.getElementById('fontColor');
    const position = document.getElementById('position');
    const saveBtn = document.getElementById('saveBtn');
    const openPanelBtn = document.getElementById('openPanelBtn');

    enabled.checked = settings.enabled !== false;
    preferredLanguage.value = settings.preferredLanguage || 'ja';
    fallbackLanguage.value = settings.fallbackLanguage || 'en';
    autoTranslate.checked = settings.autoTranslateIfNotAvailable !== false;
    fontSize.value = settings.fontSize || 24;
    fontSizeValue.textContent = settings.fontSize || 24;
    captionWidth.value = settings.captionWidth || 80;
    captionWidthValue.textContent = settings.captionWidth || 80;
    fontWeight.value = settings.fontWeight || 'normal';
    fontColor.value = settings.fontColor || '#ffffff';
    position.value = settings.position || 'bottom';

    fontSize.addEventListener('input', (e) => {
        fontSizeValue.textContent = e.target.value;
    });

    captionWidth.addEventListener('input', (e) => {
        captionWidthValue.textContent = e.target.value;
    });

    saveBtn.addEventListener('click', async () => {
        const newSettings = {
            enabled: enabled.checked,
            preferredLanguage: preferredLanguage.value,
            fallbackLanguage: fallbackLanguage.value,
            autoTranslateIfNotAvailable: autoTranslate.checked,
            fontSize: parseInt(fontSize.value, 10),
            captionWidth: parseInt(captionWidth.value, 10),
            fontWeight: fontWeight.value,
            fontColor: fontColor.value,
            position: position.value
        };

        await chrome.storage.local.set({ yse_settings: newSettings });
        saveBtn.textContent = '保存完了!';
        setTimeout(() => { saveBtn.textContent = '保存'; }, 1500);

        sendMessageToTab('settingsUpdated');
    });

    openPanelBtn.addEventListener('click', () => {
        sendMessageToTab('openSettings');
        window.close();
    });

    async function loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['yse_settings'], (result) => {
                resolve(result.yse_settings || {});
            });
        });
    }

    function sendMessageToTab(action) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action }, () => {});
            }
        });
    }
});
