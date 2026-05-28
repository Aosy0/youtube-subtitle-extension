/**
 * Launch Chrome using an existing profile that already has the extension installed
 * and run a minimal check on YouTube to confirm the extension is active.
 *
 * Usage: node run-with-installed-profile.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const WORKDIR = path.resolve(new URL('.', import.meta.url).pathname || '.');
const VIDEO_URL = 'https://www.youtube.com/watch?v=rTBkjR7JvzI';
const PROFILE_DIR = path.resolve(WORKDIR, '..', '..', 'chrome-test-profile');
const CDP_PORT = 9240;

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || null;
}

async function run() {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.error('Profile directory not found:', PROFILE_DIR);
    process.exit(1);
  }

  const chromePath = findChrome();
  if (!chromePath) {
    console.error('Chrome not found on this machine');
    process.exit(1);
  }

  console.log('Launching Chrome with profile:', PROFILE_DIR);
  const chromeProc = spawn(chromePath, [
    `--user-data-dir=${PROFILE_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    VIDEO_URL,
  ], { detached: true, stdio: 'ignore' });
  chromeProc.unref();

  await new Promise(r => setTimeout(r, 8000));

  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    const context = browser.contexts()[0];
    let page = context.pages().find(p => p.url().includes('youtube'));
    if (!page) {
      page = await context.newPage();
      await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
    }

    page.on('console', msg => console.log('[PAGE]', msg.text()));

    await new Promise(r => setTimeout(r, 3000));

    const state = await page.evaluate(() => {
      return {
        url: location.href,
        hasSettings: typeof window.Settings !== 'undefined',
        hasLogger: typeof window.Logger !== 'undefined',
        hasSubtitleEnhancer: typeof window.SubtitleEnhancer !== 'undefined',
        overlayExists: !!document.querySelector('#yse-caption-overlay'),
        overlayDisplay: getComputedStyle(document.querySelector('#yse-caption-overlay') || document.body).display,
        overlayText: document.querySelector('#yse-caption-overlay')?.textContent || '',
        subtitlesButton: document.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed') || null,
        captionSegments: document.querySelectorAll('.ytp-caption-segment').length,
      };
    });

    console.log('Initial check:', JSON.stringify(state, null, 2));

    // Try to enable subtitles via the button if available
    const subBtn = await page.$('.ytp-subtitles-button');
    if (subBtn) {
      const pressed = await subBtn.getAttribute('aria-pressed');
      console.log('Subtitle button aria-pressed:', pressed);
      if (pressed === 'false') {
        await subBtn.click();
        await new Promise(r => setTimeout(r, 4000));
      }
    }

    const after = await page.evaluate(() => {
      return {
        hasSubtitleEnhancer: typeof window.SubtitleEnhancer !== 'undefined',
        overlayExists: !!document.querySelector('#yse-caption-overlay'),
        overlayDisplay: getComputedStyle(document.querySelector('#yse-caption-overlay') || document.body).display,
        overlayText: document.querySelector('#yse-caption-overlay')?.textContent || '',
        captionSegments: document.querySelectorAll('.ytp-caption-segment').length,
        subtitlesButton: document.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed') || null,
      };
    });

    console.log('After enabling subtitles:', JSON.stringify(after, null, 2));

    await browser.close();
  } catch (e) {
    console.error('Error during test:', e.message);
  } finally {
    try { process.kill(-chromeProc.pid); } catch (e) {}
  }
}

run();
