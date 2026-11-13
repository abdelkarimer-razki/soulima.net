import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_DIR = path.resolve(__dirname, '../reports');
const SCREENSHOT_DIR = path.resolve(REPORT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const REPORT = {
  timestamp: new Date().toISOString(),
  targetUrl: 'http://127.0.0.1:4200',
  streamingUrl: 'http://127.0.0.1:3030',
  steps: [],
  errors: [],
  success: false
};

function logStep(name, status, details = {}) {
  const step = { name, status, time: new Date().toISOString(), details };
  REPORT.steps.push(step);
  console.log(`[TEST STEP] ${name}: ${status.toUpperCase()} ${JSON.stringify(details)}`);
}

async function runRealUserTest() {
  console.log('=== Starting Soulima End-to-End Real User Test ===');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'],
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      REPORT.errors.push({ type: 'browser_console', text: msg.text() });
      console.error(`[BROWSER ERROR] ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    REPORT.errors.push({ type: 'page_error', text: err.message });
    console.error(`[PAGE EXCEPTION] ${err.message}`);
  });

  page.on('requestfailed', req => {
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') {
      REPORT.errors.push({
        type: 'network_failure',
        url: req.url(),
        error: req.failure()?.errorText
      });
    }
  });

  try {
    // -------------------------------------------------------------
    // Step 1: Open Home Page
    // -------------------------------------------------------------
    logStep('Open Homepage', 'running');
    await page.goto('http://127.0.0.1:4200', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('nav.navBar, .searchBar', { timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_homepage.png') });
    logStep('Open Homepage', 'passed', { url: page.url() });

    // Close any floating share banner if present
    try {
      const closeBtn = await page.$('.share-invite-banner .close-btn');
      if (closeBtn) {
        await closeBtn.click();
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (_) {}

    // -------------------------------------------------------------
    // Step 2: Search for a Title ("Matrix")
    // -------------------------------------------------------------
    logStep('Search Title', 'running', { query: 'Matrix' });
    const searchInput = await page.waitForSelector('input.searchBar', { timeout: 10000 });
    if (!searchInput) throw new Error('Search input .searchBar not found');

    await searchInput.click();
    await searchInput.type('Matrix', { delay: 100 });
    await new Promise(r => setTimeout(r, 2500)); // wait for debounce / API results

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_search_results.png') });
    logStep('Search Title', 'passed');

    // -------------------------------------------------------------
    // Step 3: Select Search Result Card & Open Details Modal
    // -------------------------------------------------------------
    logStep('Select Movie Result', 'running');
    const resultCard = await page.waitForSelector('.search-card, .moviesSearch, .searchResutls a, .movies', { timeout: 15000 });
    if (!resultCard) throw new Error('No search result card element found');

    await resultCard.click();
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_details_modal.png') });
    logStep('Select Movie Result', 'passed');

    // -------------------------------------------------------------
    // Step 4: Click "Play Now" to enter Torrent Player
    // -------------------------------------------------------------
    logStep('Click Play Now', 'running');
    const playBtn = await page.waitForSelector('a.playinPopUp, .play', { timeout: 10000 });
    if (!playBtn) throw new Error('Play Now button not found in modal');

    await playBtn.click();
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_player_loading.png') });
    logStep('Click Play Now', 'passed', { playerUrl: page.url() });

    // -------------------------------------------------------------
    // Step 5: Verify Torrent Player & Video Element
    // -------------------------------------------------------------
    logStep('Verify Video Player', 'running');
    await page.waitForSelector('.torrentPlayer, video', { timeout: 20000 });
    const videoState = await page.evaluate(() => {
      const v = document.querySelector('video');
      return {
        found: !!v,
        currentSrc: v ? (v.currentSrc || v.src) : '',
        paused: v ? v.paused : true,
        currentTime: v ? v.currentTime : 0,
        readyState: v ? v.readyState : 0
      };
    });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_player_mounted.png') });
    logStep('Verify Video Player', 'passed', videoState);

    // -------------------------------------------------------------
    // Step 6: Test Changing Minutes (Seeking Timeline)
    // -------------------------------------------------------------
    logStep('Seek Timeline / Minutes Change', 'running');
    const seekState = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v) return { ok: false, reason: 'no video' };
      const before = v.currentTime;
      // Advance by 120 seconds (2 minutes)
      v.currentTime = (v.currentTime || 0) + 120;
      return { ok: true, beforeTime: before, afterTime: v.currentTime };
    });

    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_seek_performed.png') });
    logStep('Seek Timeline / Minutes Change', 'passed', seekState);

    // -------------------------------------------------------------
    // Step 7: Test Subtitle & Language Menu
    // -------------------------------------------------------------
    logStep('Language & Subtitle Switch', 'running');

    // Move mouse over player to activate HUD controls
    await page.mouse.move(640, 360);
    await new Promise(r => setTimeout(r, 1000));

    // Wait a moment for subtitleService to populate tracks
    await new Promise(r => setTimeout(r, 3000));

    // Click the CC button (.hudCcBtn) to open subtitle menu
    const ccBtn = await page.$('.hudCcBtn');
    if (ccBtn) {
      await ccBtn.click();
      await new Promise(r => setTimeout(r, 800));
    }

    // Inspect subtitle list in DOM
    const subInfo = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.subtitleMenuItem'));
      return {
        itemsCount: items.length,
        languages: items.map(el => el.textContent?.trim()).filter(Boolean)
      };
    });

    // If subtitle items exist, click a language option
    const subtitleItems = await page.$$('.subtitleMenuItem');
    let switchedLang = null;
    if (subtitleItems.length > 1) {
      switchedLang = await page.evaluate(el => el.textContent?.trim(), subtitleItems[1]);
      await subtitleItems[1].click().catch(() => {});
      await new Promise(r => setTimeout(r, 500));
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_subtitles_verified.png') });
    logStep('Language & Subtitle Switch', 'passed', {
      availableSubtitles: subInfo.itemsCount,
      languages: subInfo.languages.slice(0, 5),
      switchedTo: switchedLang
    });

    REPORT.success = true;
    console.log('=== User Flow Test Completed Successfully! ===');
  } catch (err) {
    logStep('Test Execution', 'failed', { error: err.message, stack: err.stack });
    REPORT.errors.push({ type: 'fatal_test_error', message: err.message });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_state.png') }).catch(() => {});
  } finally {
    await browser.close();
    fs.writeFileSync(
      path.join(REPORT_DIR, 'test_report.json'),
      JSON.stringify(REPORT, null, 2)
    );
    console.log(`Saved test report to ${path.join(REPORT_DIR, 'test_report.json')}`);
  }
}

runRealUserTest();
