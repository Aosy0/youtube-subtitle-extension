import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launchPersistentContext(
    './tests/e2e/debug-no-ext',
    {
      headless: false,
    }
  );

  const page = await browser.newPage();
  
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { 
    waitUntil: 'networkidle',
    timeout: 60000 
  });
  
  // Get base URL and try different endpoints
  const baseUrl = await page.evaluate(() => {
    const player = document.querySelector('#movie_player');
    const response = player.getPlayerResponse();
    return response.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0]?.baseUrl;
  });
  
  if (!baseUrl) {
    console.log('No base URL found');
    await browser.close();
    return;
  }
  
  console.log('Base URL:', baseUrl);
  
  // Try alternative endpoints
  const alternatives = [
    // Try video.google.com (older endpoint)
    {
      name: 'video.google.com',
      url: baseUrl.replace('www.youtube.com', 'video.google.com')
    },
    // Try with different params
    {
      name: 'With xorb=2',
      url: baseUrl + '&xorb=2'
    },
    {
      name: 'With xorb=2 and fmt',
      url: baseUrl.replace(/&fmt=[^&]+/, '') + '&fmt=srv1'
    },
    {
      name: 'Without caps param',
      url: baseUrl.replace(/&caps=[^&]+/, '')
    },
    {
      name: 'Minimal URL',
      url: (() => {
        const u = new URL(baseUrl);
        return `https://www.youtube.com/api/timedtext?v=${u.searchParams.get('v')}&lang=${u.searchParams.get('lang')}`;
      })()
    },
    {
      name: 'With authuser',
      url: baseUrl + '&authuser=0'
    }
  ];
  
  for (const alt of alternatives) {
    console.log(`\n=== ${alt.name} ===`);
    console.log('URL:', alt.url.substring(0, 120));
    
    const result = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, { credentials: 'include' });
        const text = await res.text();
        return {
          status: res.status,
          type: res.headers.get('content-type'),
          length: text.length,
          preview: text.substring(0, 200),
        };
      } catch (err) {
        return { error: err.message };
      }
    }, alt.url);
    
    console.log(JSON.stringify(result, null, 2));
  }
  
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
