// ============================================
// MCPテスト用 - 拡張機能付きChromeで字幕タイミング確認
// ============================================
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('[TEST] 拡張機能付きChromeを起動します...');

  const extensionPath = path.resolve(__dirname, '..', '..');
  console.log(`[TEST] 拡張機能パス: ${extensionPath}`);

  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--lang=ja',
    ],
    locale: 'ja-JP',
    viewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();

  // コンソールログ収集
  const logs = [];
  page.on('console', msg => {
    if (msg.text().includes('[YSE')) {
      logs.push(msg.text());
      console.log(`[PAGE] ${msg.text()}`);
    }
  });

  // YouTube動画を開く（日本語字幕がある動画）
  const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  console.log(`[TEST] 動画を開きます: ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => {
    console.log(`[WARN] タイムアウト: ${e.message}`);
  });

  // 拡張機能の初期化を待つ
  await page.waitForTimeout(3000);

  // 拡張機能のロード状態を確認
  console.log('\n[CHECK] 拡張機能の初期化状態:');
  const initState = await page.evaluate(() => {
    return {
      hasBridge: !!document.getElementById('yse-data-bridge'),
      hasSettings: typeof window.Settings !== 'undefined',
      hasSubtitleEnhancer: typeof window.SubtitleEnhancer !== 'undefined',
      hasLogger: typeof window.Logger !== 'undefined',
      hasOverlay: !!document.querySelector('#yse-caption-overlay'),
      url: location.href
    };
  });
  console.log(JSON.stringify(initState, null, 2));

  if (!initState.hasSubtitleEnhancer) {
    console.log('[ERROR] 拡張機能がロードされていません。テストを中止します。');
    await browser.close();
    return;
  }

  console.log('[OK] 拡張機能が正常にロードされました');

  // 字幕をONにする
  console.log('\n[TEST] 字幕をONにします...');
  const subtitleButton = await page.$('.ytp-subtitles-button');
  if (subtitleButton) {
    const isPressed = await subtitleButton.getAttribute('aria-pressed');
    console.log(`[INFO] 字幕ボタン aria-pressed: ${isPressed}`);
    if (isPressed !== 'true') {
      await subtitleButton.click();
      console.log('[OK] 字幕ボタンをクリックしました');
      await page.waitForTimeout(2000);
    }
  }

  // 字幕データ取得を待つ
  await page.waitForTimeout(3000);

  // 字幕ブロック数を確認
  const blockCount = await page.evaluate(() => {
    return window.SubtitleEnhancer?.captionBlocks?.length || 0;
  });
  console.log(`[INFO] 字幕ブロック数: ${blockCount}`);

  if (blockCount > 0) {
    // 字幕ブロックの詳細を表示
    console.log('\n[INFO] 字幕ブロック詳細 (先頭5個):');
    const blocks = await page.evaluate(() => {
      return window.SubtitleEnhancer.captionBlocks.slice(0, 5).map((b, i) => ({
        index: i,
        start: b.start,
        end: b.end,
        duration: b.end - b.start,
        text: b.text.substring(0, 40)
      }));
    });
    blocks.forEach(b => {
      console.log(`  [${b.index}] ${b.start}ms - ${b.end}ms (${b.duration}ms): "${b.text}"`);
    });

    // 現在のoffset設定を確認
    console.log('\n[CHECK] 現在のタイミング設定:');
    const offsetConfig = await page.evaluate(() => {
      const slider = document.querySelector('input[data-key="subtitleOffset"]');
      return {
        sliderValue: slider ? slider.value : 'N/A',
        settingsValue: Settings.get('subtitleOffset'),
        defaultOffset: CONFIG.DEFAULT_SETTINGS.subtitleOffset
      };
    });
    console.log(JSON.stringify(offsetConfig, null, 2));

    // 設定パネルを開く（Alt+S）
    console.log('\n[TEST] 設定パネルを開きます (Alt+S)...');
    await page.keyboard.down('Alt');
    await page.keyboard.press('KeyS');
    await page.keyboard.up('Alt');
    await page.waitForTimeout(1500);

    const panelExists = await page.$('.yse-settings-panel');
    if (panelExists) {
      console.log('[OK] 設定パネルが表示されました');

      // offsetを600msに変更
      console.log('[TEST] subtitleOffsetを600msに変更します...');
      await page.evaluate(() => {
        const slider = document.querySelector('input[data-key="subtitleOffset"]');
        if (slider) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          ).set;
          nativeInputValueSetter.call(slider, 600);
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          slider.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(500);

      // 変更が反映されたか確認
      const newOffset = await page.evaluate(() => {
        const slider = document.querySelector('input[data-key="subtitleOffset"]');
        const display = document.querySelector('#subtitleOffset-value');
        return {
          slider: slider?.value,
          display: display?.textContent,
          settings: Settings.get('subtitleOffset')
        };
      });
      console.log(`[OK] 変更後: slider=${newOffset.slider}, display=${newOffset.display}, settings=${newOffset.settings}`);

      // パネルを閉じる
      const closeBtn = await page.$('.yse-settings-close');
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    } else {
      console.log('[WARN] 設定パネルが表示されませんでした');
    }

    // 動画を再生して字幕の表示を確認
    console.log('\n[TEST] 動画を再生して字幕表示を確認します...');
    const video = await page.$('video');
    if (video) {
      // 10秒地点にシーク
      await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v) { v.currentTime = 10; v.pause(); }
      });
      await page.waitForTimeout(1000);

      // 表示されている字幕を確認
      const overlayText = await page.evaluate(() => {
        const overlay = document.querySelector('#yse-caption-overlay');
        return overlay ? {
          visible: getComputedStyle(overlay).display !== 'none',
          text: overlay.textContent
        } : { visible: false, text: 'N/A' };
      });
      console.log(`[INFO] 10秒地点の字幕: 表示=${overlayText.visible}, テキスト="${overlayText.text}"`);

      // 20秒地点にシーク
      await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v) { v.currentTime = 20; v.pause(); }
      });
      await page.waitForTimeout(1000);

      const overlayText2 = await page.evaluate(() => {
        const overlay = document.querySelector('#yse-caption-overlay');
        return overlay ? {
          visible: getComputedStyle(overlay).display !== 'none',
          text: overlay.textContent
        } : { visible: false, text: 'N/A' };
      });
      console.log(`[INFO] 20秒地点の字幕: 表示=${overlayText2.visible}, テキスト="${overlayText2.text}"`);

      // 動画を再生
      await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v) v.play();
      });
      console.log('[OK] 動画を再生しました。実際の字幕表示タイミングを確認してください。');
    }

    // スクリーンショットを保存
    const screenshotPath = path.join(__dirname, '..', '..', 'test-results', 'subtitle-active.png');
    if (!fs.existsSync(path.dirname(screenshotPath))) {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    }
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`\n[OK] スクリーンショット保存: ${screenshotPath}`);

  } else {
    console.log('[WARN] 字幕ブロックが取得できませんでした');
    console.log('[INFO] 考えられる原因:');
    console.log('  1. YouTubeのPoTトークン未取得によるAPI制限');
    console.log('  2. 動画に日本語字幕が含まれていない');
    console.log('  3. ネットワークエラー');
  }

  // 結果を保存
  const result = {
    timestamp: new Date().toISOString(),
    extensionLoaded: initState.hasSubtitleEnhancer,
    blockCount,
    offsetConfig: await page.evaluate(() => ({
      current: Settings.get('subtitleOffset'),
      default: CONFIG.DEFAULT_SETTINGS.subtitleOffset
    })).catch(() => 'N/A'),
    changes: [
      'ブロックendTime延長: +500ms → +200ms',
      'ポーリング間隔: 50ms → 30ms',
      'デフォルトoffset: 200ms → 300ms',
      'スライダー範囲: -500~2000ms → -1000~1000ms'
    ],
    logs: logs.slice(-50)
  };

  const resultFile = path.join(__dirname, '..', '..', 'test-results', 'mcp-test-result.json');
  if (!fs.existsSync(path.dirname(resultFile))) {
    fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  }
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n[OK] テスト結果保存: ${resultFile}`);

  console.log('\n========================================');
  console.log('[TEST] テスト完了');
  console.log('[INFO] ブラウザは開いたままにします。実際の字幕表示を確認してください。');
  console.log('[INFO] 設定パネルは Alt+S で開閉できます');
  console.log('========================================');

  // ユーザーが確認できるようにブラウザは開いたままにする
  // await browser.close();
})();
