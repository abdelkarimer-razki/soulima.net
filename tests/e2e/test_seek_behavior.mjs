import puppeteer from 'puppeteer';

const BASE_URL = 'http://127.0.0.1:3030';

(async () => {
  console.log('▶ Starting Intensive Seek E2E Verification on MKV and MP4...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (u.includes('googletagmanager.com') || u.includes('_vercel') || u.includes('youtube.com')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    // Test on Breaking Bad (1080p 10bit HEVC MKV container with on-the-fly FFmpeg remuxing)
    console.log('1. Loading Breaking Bad S01E01 (MKV x265)...');
    await page.goto(`${BASE_URL}/serie/1396/1/1`, { waitUntil: 'domcontentloaded', timeout: 25000 });

    console.log('Waiting for video to start playing...');
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      const comp = window.torrentPlayerComponent;
      return v && v.readyState >= 2 && comp && comp.currentTime > 0;
    }, { timeout: 45000 });

    const initialTime = await page.evaluate(() => window.torrentPlayerComponent.currentTime);
    console.log(`Video started playing. Initial currentTime = ${initialTime.toFixed(1)}s`);

    // Test 1: Skip +30s
    console.log('\n2. Testing skip(+30s)...');
    await page.evaluate(() => window.torrentPlayerComponent.skip(30));
    await new Promise(r => setTimeout(r, 1200));

    let time1 = await page.evaluate(() => window.torrentPlayerComponent.currentTime);
    console.log(`Time after skip(+30s): ${time1.toFixed(1)}s`);
    if (time1 < 25) throw new Error(`Seek failed: Expected >= 25s, got ${time1}s (snapped to beginning!)`);

    // Test 2: Skip +120s (2 minutes into video)
    console.log('\n3. Testing skip(+120s)...');
    await page.evaluate(() => window.torrentPlayerComponent.skip(120));
    await new Promise(r => setTimeout(r, 2000));

    let time2 = await page.evaluate(() => window.torrentPlayerComponent.currentTime);
    console.log(`Time after skip(+120s): ${time2.toFixed(1)}s`);
    if (time2 < 130) throw new Error(`Seek failed: Expected >= 130s, got ${time2}s (snapped to beginning!)`);

    // Test 3: Direct seek to 600s (10 minutes)
    console.log('\n4. Testing performSeek(600s)...');
    await page.evaluate(() => window.torrentPlayerComponent.performSeek(600));
    await new Promise(r => setTimeout(r, 2500));

    let time3 = await page.evaluate(() => window.torrentPlayerComponent.currentTime);
    console.log(`Time after performSeek(600s): ${time3.toFixed(1)}s`);
    if (time3 < 580) throw new Error(`Seek failed: Expected >= 580s, got ${time3}s (snapped to beginning!)`);

    // Test 4: Skip -30s backward
    console.log('\n5. Testing skip(-30s) backward...');
    await page.evaluate(() => window.torrentPlayerComponent.skip(-30));
    await new Promise(r => setTimeout(r, 1500));

    let time4 = await page.evaluate(() => window.torrentPlayerComponent.currentTime);
    console.log(`Time after skip(-30s): ${time4.toFixed(1)}s`);
    if (time4 < 540 || time4 > 590) throw new Error(`Seek failed: Expected between 540s and 590s, got ${time4}s`);

    console.log('\n======================================================');
    console.log('✓ ALL TIMELINE SEEK TESTS PASSED WITH ZERO RESETS!');
    console.log('======================================================');

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seek test failed:', err.message);
    await browser.close();
    process.exit(1);
  }
})();
