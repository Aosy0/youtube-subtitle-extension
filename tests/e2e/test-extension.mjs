import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(__dirname, '..', '..');

async function testSubtitleFlow() {
  console.log('=== Testing subtitle display flow ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('about:blank');
  
  // Inject styles
  const styles = fs.readFileSync(path.join(rootPath, 'styles.css'), 'utf-8');
  await page.evaluate((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }, styles);
  
  // Mock chrome API
  await page.evaluate(() => {
    const storageData = {};
    window.chrome = {
      storage: {
        local: {
          get: (keys, callback) => {
            const result = typeof keys === 'string' ? { [keys]: storageData[keys] } : { ...storageData };
            if (typeof callback === 'function') callback(result);
            return Promise.resolve(result);
          },
          set: (items, callback) => {
            Object.assign(storageData, items);
            if (typeof callback === 'function') callback();
            return Promise.resolve();
          }
        }
      },
      runtime: {
        onMessage: { addListener: () => {} }
      }
    };
  });
  
  // Inject scripts
  const scripts = ['yse-common.js', 'player-controller.js', 'subtitle-enhancer.js', 'youtube-settings.js', 'ui-controller.js', 'content.js'];
  for (const script of scripts) {
    const code = fs.readFileSync(path.join(rootPath, script), 'utf-8');
    await page.evaluate(code);
  }
  
  // Initialize
  await page.evaluate(async () => {
    await Settings.init();
    PlayerController.init();
    // LogPanel has show() not init()
  });
  
  // Create mock YouTube page structure
  await page.evaluate(() => {
    const player = document.createElement('div');
    player.className = 'html5-video-player';
    document.body.appendChild(player);
    
    const video = document.createElement('video');
    video.currentTime = 5;
    document.body.appendChild(video);
    
    const subBtn = document.createElement('button');
    subBtn.className = 'ytp-subtitles-button';
    subBtn.setAttribute('aria-pressed', 'false');
    document.body.appendChild(subBtn);
    
    const captionContainer = document.createElement('div');
    captionContainer.className = 'ytp-caption-window-container';
    document.body.appendChild(captionContainer);
  });
  
  // Initialize SubtitleEnhancer
  await page.evaluate(() => {
    SubtitleEnhancer.init();
  });
  
  await page.waitForTimeout(500);
  
  // Test 1: Overlay should be hidden initially
  console.log('Test 1: Initial overlay state');
  let overlayState = await page.evaluate(() => {
    const overlay = document.getElementById('yse-caption-overlay');
    return overlay ? { display: overlay.style.display, visibility: overlay.style.visibility } : { error: 'not found' };
  });
  console.log(JSON.stringify(overlayState, null, 2));
  
  // Test 2: Enable subtitles
  console.log('\nTest 2: Enable subtitles');
  await page.evaluate(() => {
    const btn = document.querySelector('.ytp-subtitles-button');
    btn.setAttribute('aria-pressed', 'true');
  });
  await page.waitForTimeout(500);
  
  // Simulate checkState
  await page.evaluate(() => {
    SubtitleEnhancer.checkState();
  });
  await page.waitForTimeout(500);
  
  overlayState = await page.evaluate(() => {
    const overlay = document.getElementById('yse-caption-overlay');
    return overlay ? { display: overlay.style.display, text: overlay.textContent?.substring(0, 50) } : { error: 'not found' };
  });
  console.log(JSON.stringify(overlayState, null, 2));
  
  // Test 3: Simulate subtitle data and display
  console.log('\nTest 3: Display subtitle text');
  await page.evaluate(() => {
    SubtitleEnhancer.captionBlocks = [
      { start: 0, end: 10000, text: 'これはテスト字幕です。' }
    ];
    SubtitleEnhancer.displaySentence('これはテスト字幕です。');
  });
  
  overlayState = await page.evaluate(() => {
    const overlay = document.getElementById('yse-caption-overlay');
    return overlay ? { 
      display: overlay.style.display, 
      text: overlay.textContent?.trim(),
      background: overlay.style.background,
    } : { error: 'not found' };
  });
  console.log(JSON.stringify(overlayState, null, 2));
  
  // Test 4: Disable subtitles
  console.log('\nTest 4: Disable subtitles');
  await page.evaluate(() => {
    const btn = document.querySelector('.ytp-subtitles-button');
    btn.setAttribute('aria-pressed', 'false');
    SubtitleEnhancer.checkState();
  });
  await page.waitForTimeout(500);
  
  overlayState = await page.evaluate(() => {
    const overlay = document.getElementById('yse-caption-overlay');
    return overlay ? { display: overlay.style.display, visibility: overlay.style.visibility } : { error: 'not found' };
  });
  console.log(JSON.stringify(overlayState, null, 2));
  
  // Test 5: Verify no visible element when subtitles are off
  console.log('\nTest 5: Check for visible artifacts when disabled');
  const visibleCheck = await page.evaluate(() => {
    const overlay = document.getElementById('yse-caption-overlay');
    if (!overlay) return { found: false };
    const rect = overlay.getBoundingClientRect();
    const computed = window.getComputedStyle(overlay);
    return {
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      hasBackground: computed.background !== 'none' && computed.background !== '',
    };
  });
  console.log(JSON.stringify(visibleCheck, null, 2));
  
  await browser.close();
  console.log('\n=== All tests completed ===');
}

testSubtitleFlow().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
