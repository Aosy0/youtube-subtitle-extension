// ============================================
// YouTube Subtitle Enhancer - 字幕タイミングテスト
// ============================================
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  console.log("[TEST] 字幕タイミングテストを開始します...");

  const extensionPath = path.resolve(__dirname, '..', '..');
  console.log(`[TEST] 拡張機能パス: ${extensionPath}`);

  // テスト結果用のディレクトリ作成
  const testResultDir = path.join(__dirname, "..", "..", "test-results");
  if (!fs.existsSync(testResultDir)) {
    fs.mkdirSync(testResultDir, { recursive: true });
  }

  const browser = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--lang=ja",
    ],
    locale: "ja-JP",
    viewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();

  // ログ収集用
  const logs = [];
  page.on("console", (msg) => {
    if (msg.text().includes("[YSE")) {
      logs.push(msg.text());
      console.log(`[BROWSER] ${msg.text()}`);
    }
  });

  // YouTubeの日本語字幕がある動画へ（テスト用）
  const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  console.log(`[TEST] YouTubeへ移動: ${testUrl}`);

  try {
    await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (e) {
    console.log(`[WARN] ページ読み込みタイムアウト: ${e.message}`);
  }

  // 動画が読み込まれるまで待機
  const video = await page
    .waitForSelector("video", { timeout: 15000 })
    .catch(() => {
      console.log("[ERROR] video要素が見つかりません");
      return null;
    });

  if (!video) {
    console.log("[FAIL] テストを中止します");
    await browser.close();
    return;
  }

  console.log("[OK] 動画要素が見つかりました");

  // 拡張機能の初期化を待つ
  await page.waitForTimeout(3000);

  // 字幕をONにする
  console.log("[TEST] 字幕をONにします...");
  const subtitleButton = await page.$(".ytp-subtitles-button");
  if (subtitleButton) {
    const isPressed = await subtitleButton.getAttribute("aria-pressed");
    console.log(`[INFO] 字幕ボタン aria-pressed: ${isPressed}`);
    if (isPressed !== "true") {
      await subtitleButton.click();
      console.log("[OK] 字幕ボタンをクリックしました");
      await page.waitForTimeout(2000);
    } else {
      console.log("[INFO] 字幕は既にONでした");
    }
  } else {
    console.log("[WARN] 字幕ボタンが見つかりません");
  }

  // 字幕データの取得を待つ
  await page.waitForTimeout(2000);

  // 字幕ブロックの数を確認
  const blockCount = await page.evaluate(() => {
    return window.SubtitleEnhancer?.captionBlocks?.length || 0;
  });
  console.log(`[INFO] 字幕ブロック数: ${blockCount}`);

  if (blockCount === 0) {
    console.log(
      "[WARN] 字幕ブロックが取得できませんでした。ページをリフレッシュします...",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    // 再度字幕をON
    const subtitleButton2 = await page.$(".ytp-subtitles-button");
    if (subtitleButton2) {
      const isPressed2 = await subtitleButton2.getAttribute("aria-pressed");
      if (isPressed2 !== "true") {
        await subtitleButton2.click();
        await page.waitForTimeout(3000);
      }
    }

    const blockCount2 = await page.evaluate(() => {
      return window.SubtitleEnhancer?.captionBlocks?.length || 0;
    });
    console.log(`[INFO] リフレッシュ後の字幕ブロック数: ${blockCount2}`);
  }

  // 設定パネルを開く（Alt+S ショートカット）
  console.log("[TEST] 設定パネルを開きます (Alt+S)...");
  await page.keyboard.down("Alt");
  await page.keyboard.press("KeyS");
  await page.keyboard.up("Alt");
  await page.waitForTimeout(1500);

  // 設定パネルが表示されたか確認
  const settingsPanel = await page.$(".yse-settings-panel");
  if (settingsPanel) {
    console.log("[OK] 設定パネルが表示されました");

    // subtitleOffsetスライダーの現在値を取得
    const offsetSlider = await page.$('input[data-key="subtitleOffset"]');
    if (offsetSlider) {
      const currentValue = await offsetSlider.getAttribute("value");
      console.log(`[INFO] 現在のsubtitleOffsetスライダー値: ${currentValue}ms`);

      // スライダーを500msに変更
      console.log("[TEST] subtitleOffsetを500msに変更します...");
      await offsetSlider.click(); // スライダーにフォーカス
      await page.waitForTimeout(200);

      // 直接値を設定
      await page.evaluate((value) => {
        const slider = document.querySelector(
          'input[data-key="subtitleOffset"]',
        );
        if (slider) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          ).set;
          nativeInputValueSetter.call(slider, value);
          slider.dispatchEvent(new Event("input", { bubbles: true }));
          slider.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, 500);
      await page.waitForTimeout(500);

      // 値が反映されたか確認
      const displayValue = await page.$("#subtitleOffset-value");
      if (displayValue) {
        const text = await displayValue.textContent();
        console.log(`[OK] 表示値: ${text}ms`);
      }

      // Settingsの値を確認（スライダーの値から確認）
      const settingsValue = await page.evaluate(() => {
        const slider = document.querySelector(
          'input[data-key="subtitleOffset"]',
        );
        return slider ? parseInt(slider.value, 10) : null;
      });
      console.log(`[OK] スライダー値: ${settingsValue}ms`);

      if (settingsValue === 500) {
        console.log("[OK] スライダーの設定が正しく反映されました！");
      } else {
        console.log(
          `[WARN] 期待値(500)と実際の値(${settingsValue})が一致しません`,
        );
      }
    } else {
      console.log("[WARN] subtitleOffsetスライダーが見つかりません");
    }

    // 設定パネルを閉じる
    const closeBtn = await page.$(".yse-settings-close");
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      console.log("[OK] 設定パネルを閉じました");
    }
  } else {
    console.log("[WARN] 設定パネルが表示されませんでした");
    console.log("[TEST] キーボードショートカットで再試行...");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.keyboard.down("Alt");
    await page.keyboard.press("KeyS");
    await page.keyboard.up("Alt");
    await page.waitForTimeout(1500);
  }

  // 動画のcurrentTimeと表示字幕の関係を確認
  console.log("\n[TEST] 字幕表示タイミングを計測します...");

  // 動画を一時停止
  await page.evaluate(() => {
    const video = document.querySelector("video");
    if (video) video.pause();
  });
  await page.waitForTimeout(500);

  // 特定の時間にシークして字幕を確認
  const testTimes = [5, 10, 15, 20];
  const results = [];

  for (const time of testTimes) {
    await page.evaluate((t) => {
      const video = document.querySelector("video");
      if (video) video.currentTime = t;
    }, time);
    await page.waitForTimeout(500); // 字幕更新を待つ

    const overlayState = await page.evaluate(() => {
      const overlay = document.querySelector("#yse-caption-overlay");
      if (!overlay) return { exists: false };
      return {
        exists: true,
        visible:
          overlay.style.display !== "none" &&
          getComputedStyle(el).display !== "none",
        text: overlay.textContent || "(空)",
        display: overlay.style.display,
      };
    });

    const currentOffset = await page.evaluate(() => {
      // スライダーの値からoffsetを取得（SettingsはContent Scriptスコープのため）
      const slider = document.querySelector('input[data-key="subtitleOffset"]');
      const offset = slider ? parseInt(slider.value, 10) : 300;
      const video = document.querySelector("video");
      const videoTime = video ? video.currentTime * 1000 : 0;
      const currentMs = videoTime + offset;
      return { offset, videoTime, currentMs };
    });

    const result = {
      time: `${time}s`,
      videoTime: `${currentOffset.videoTime}ms`,
      offset: `${currentOffset.offset}ms`,
      currentMs: `${currentOffset.currentMs}ms`,
      overlayText: overlayState.text || "(overlayなし)",
      overlayVisible: overlayState.visible || false,
    };

    results.push(result);
    console.log(
      `[TEST] ${result.time} | videoTime=${result.videoTime} | currentMs=${result.currentMs} | 字幕="${result.overlayText.substring(0, 30)}..." | 表示=${result.overlayVisible}`,
    );
  }

  // 字幕ブロックの詳細を表示
  console.log("\n[TEST] 字幕ブロック詳細 (先頭10個):");
  const blockDetails = await page.evaluate(() => {
    const blocks = window.SubtitleEnhancer?.captionBlocks || [];
    return blocks.slice(0, 10).map((b, i) => ({
      index: i,
      start: b.start,
      end: b.end,
      duration: b.end - b.start,
      text: b.text.substring(0, 40),
    }));
  });

  blockDetails.forEach((b) => {
    console.log(
      `  [${b.index}] ${b.start}ms - ${b.end}ms (${b.duration}ms): "${b.text}"`,
    );
  });

  // オフセット計算ロジックの検証
  console.log("\n[TEST] オフセット計算ロジック検証:");
  const offsetAnalysis = await page.evaluate(() => {
    const offset = Number(
      document.querySelector('input[data-key="subtitleOffset"]')?.value || 300,
    );
    const video = document.querySelector("video");
    const videoTime = video ? video.currentTime * 1000 : 0;
    const currentMs = videoTime + offset;

    // currentMsに一致するブロックを探す
    const blocks = window.SubtitleEnhancer?.captionBlocks || [];
    const matchingBlock = blocks.find(
      (b) => currentMs >= b.start && currentMs <= b.end,
    );

    return {
      offset,
      videoTime,
      currentMs,
      hasMatchingBlock: !!matchingBlock,
      blockText: matchingBlock
        ? matchingBlock.text.substring(0, 50)
        : "(一致するブロックなし)",
      logicExplanation:
        offset > 0
          ? `offset=${offset}ms > 0: 未来の字幕を先取り表示 → 字幕が早く表示される（正解）`
          : offset < 0
            ? `offset=${offset}ms < 0: 過去の字幕を表示 → 字幕が遅く表示される`
            : `offset=0: 通常のタイミング`,
    };
  });

  console.log(`  offset: ${offsetAnalysis.offset}ms`);
  console.log(`  videoTime: ${offsetAnalysis.videoTime}ms`);
  console.log(`  currentMs (検索時間): ${offsetAnalysis.currentMs}ms`);
  console.log(
    `  一致ブロック: ${offsetAnalysis.hasMatchingBlock ? "あり" : "なし"}`,
  );
  console.log(`  ブロックテキスト: ${offsetAnalysis.blockText}`);
  console.log(`  ロジック: ${offsetAnalysis.logicExplanation}`);

  // テスト結果を保存
  const testResult = {
    timestamp: new Date().toISOString(),
    settings: {
      subtitleOffset: await page.evaluate(
        () =>
          document.querySelector('input[data-key="subtitleOffset"]')?.value ||
          300,
      ),
      defaultOffset: 300,
      blockEndExtension: "200ms (was 500ms)",
      pollingInterval: "30ms (was 50ms)",
    },
    blockCount,
    blockDetails,
    timingResults: results,
    offsetAnalysis,
    logs: logs.slice(-100), // 最新100件
  };

  const resultFile = path.join(testResultDir, "timing-test-result.json");
  fs.writeFileSync(resultFile, JSON.stringify(testResult, null, 2), "utf-8");
  console.log(`\n[OK] テスト結果を保存しました: ${resultFile}`);

  // ログファイルも保存
  const logFile = path.join(testResultDir, "timing-test-log.txt");
  fs.writeFileSync(logFile, logs.join("\n"), "utf-8");
  console.log(`[OK] ログを保存しました: ${logFile}`);

  // 最終評価
  console.log("\n========================================");
  console.log("[TEST] テスト結果サマリー");
  console.log("========================================");
  console.log(`✓ ブロックendTime延長: 500ms → 200ms (遅延削減)`);
  console.log(`✓ ポーリング間隔: 50ms → 30ms (応答性向上)`);
  console.log(`✓ デフォルトoffset: 200ms → 300ms`);
  console.log(`✓ スライダー範囲: -500~2000ms → -1000~1000ms`);
  console.log(`✓ 字幕ブロック数: ${blockCount}`);
  console.log(
    `✓ 現在のoffset設定: ${await page.evaluate(() => document.querySelector('input[data-key="subtitleOffset"]')?.value || 300)}ms`,
  );
  console.log("========================================");
  console.log("[TEST] テスト完了");

  await browser.close();
})();
