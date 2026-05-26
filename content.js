// ============================================
// YouTube Subtitle Enhancer - 初期化処理
// ============================================

'use strict';

// ============================================
// メイン初期化
// ============================================
async function yseInit() {
  await Settings.init();
  PlayerController.init();
  UIController.init();
  LogPanel.init();
  Logger.info('YouTube Subtitle Enhancer を初期化しました');
}

// DOMContentLoadedまたは即時実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', yseInit);
} else {
  yseInit();
}

// ============================================
// Chromeメッセージリスナー（ポップアップからの通信）
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openSettings') {
    if (typeof UIController !== 'undefined') {
      UIController.openSettings();
      sendResponse({success: true});
    } else {
      sendResponse({success: false, error: 'UIController not ready'});
    }
  }
  return true;
});
