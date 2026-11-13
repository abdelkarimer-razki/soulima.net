import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_DIR = path.resolve(__dirname, '../reports');
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Commercial App SLA Thresholds
const SLA_TARGETS = {
  homepageLoadMs: 2500,
  searchLatencyMs: 800,
  modalOpenMs: 500,
  timeToFirstFrameMs: 8000,
  seekLatencyMs: 1500,
  subtitleSwitchMs: 1000
};

const BENCHMARKS = {
  timestamp: new Date().toISOString(),
  metrics: {},
  slaResults: {},
  passedSla: true,
  errors: []
};

function recordMetric(name, durationMs, targetMs) {
  const passed = durationMs <= targetMs;
  BENCHMARKS.metrics[name] = {
    durationMs: Math.round(durationMs),
    targetMs,
    status: passed ? 'PASSED' : 'SLOW'
  };
  if (!passed) BENCHMARKS.passedSla = false;
  console.log(`[BENCHMARK] ${name}: ${Math.round(durationMs)}ms (Target: <${targetMs}ms) -> ${passed ? '✓ PASS' : '✗ SLOW'}`);
}

async function runPerformanceBenchmark() {
  console.log('=== Starting Soulima Commercial Speed & SLA Benchmark ===');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'],
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = await browser.newPage();

  // Fast-track navigation by only allowing app & TMDB traffic (block slow external fonts/analytics in headless tests)
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost') || url.includes('tmdb.org')) {
      req.continue();
    } else {
      req.abort();
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      BENCHMARKS.errors.push({ type: 'browser_error', text: msg.text() });
    }
  });

  try {
    // -------------------------------------------------------------
    // Metric 1: Homepage Load & Interactivity
    // -------------------------------------------------------------
    const t0 = performance.now();
    await page.goto('http://127.0.0.1:4200', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('nav.navBar, .searchBar', { timeout: 10000 });
    const homepageDuration = performance.now() - t0;
    recordMetric('Homepage Load', homepageDuration, SLA_TARGETS.homepageLoadMs);

    // Dismiss banner if present
    try {
      const closeBtn = await page.$('.share-invite-banner .close-btn');
      if (closeBtn) await closeBtn.click();
    } catch (_) {}

    // -------------------------------------------------------------
    // Metric 2: Search Query Latency
    // -------------------------------------------------------------
    const searchInput = await page.waitForSelector('input.searchBar', { timeout: 10000 });
    const tSearch = performance.now();
    await searchInput.click();
    await searchInput.type('Matrix', { delay: 60 });
    await new Promise(r => setTimeout(r, 600)); // wait for Angular debounceTime(300)
    const resultCard = await page.waitForSelector('.search-card, .moviesSearch, .searchResutls a', { timeout: 15000 });
    const searchDuration = performance.now() - tSearch;
    recordMetric('Search Response Latency', searchDuration, SLA_TARGETS.searchLatencyMs);

    // -------------------------------------------------------------
    // Metric 3: Details Modal Open Latency
    // -------------------------------------------------------------
    const tModal = performance.now();
    await resultCard.click();
    await page.waitForSelector('.detailsPopUp, a.playinPopUp, .bluredBackground', { timeout: 10000 });
    const modalDuration = performance.now() - tModal;
    recordMetric('Details Modal Open', modalDuration, SLA_TARGETS.modalOpenMs);

    // -------------------------------------------------------------
    // Metric 4: Time-to-First-Frame (TTFF)
    // -------------------------------------------------------------
    const playBtn = await page.waitForSelector('a.playinPopUp, .play', { timeout: 10000 });
    const tPlay = performance.now();
    await playBtn.click();

    // Wait until video element is mounted and starts streaming frames
    await page.waitForSelector('.torrentPlayer, video', { timeout: 20000 });
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && (v.currentTime > 0 || (v.readyState >= 2 && v.currentSrc));
    }, { timeout: 25000 });
    const ttffDuration = performance.now() - tPlay;
    recordMetric('Time to First Frame (TTFF)', ttffDuration, SLA_TARGETS.timeToFirstFrameMs);

    // -------------------------------------------------------------
    // Metric 5: Timeline Seek / Minutes Scrub Latency
    // -------------------------------------------------------------
    const tSeek = performance.now();
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.currentTime = (v.currentTime || 0) + 120; // jump 2 minutes
    });

    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && !v.seeking;
    }, { timeout: 10000 });
    const seekDuration = performance.now() - tSeek;
    recordMetric('Timeline Scrub Latency', seekDuration, SLA_TARGETS.seekLatencyMs);

    // -------------------------------------------------------------
    // Metric 6: Subtitle Menu & Language Switch
    // -------------------------------------------------------------
    await page.mouse.move(640, 360);
    const tSub = performance.now();
    const ccBtn = await page.$('.hudCcBtn');
    if (ccBtn) await ccBtn.click();

    // Check subtitle options
    await page.waitForSelector('.subtitleMenuItem, .subtitleMenuEmpty', { timeout: 5000 }).catch(() => {});
    const subDuration = performance.now() - tSub;
    recordMetric('Subtitle Menu Response', subDuration, SLA_TARGETS.subtitleSwitchMs);

    console.log('=== Performance Benchmark Completed Successfully ===');
  } catch (err) {
    console.error('Benchmark error:', err.message);
    BENCHMARKS.errors.push({ type: 'fatal_benchmark_error', message: err.message });
    BENCHMARKS.passedSla = false;
  } finally {
    await browser.close();
    fs.writeFileSync(
      path.join(REPORT_DIR, 'performance_benchmark.json'),
      JSON.stringify(BENCHMARKS, null, 2)
    );
    console.log(`Saved benchmark report to ${path.join(REPORT_DIR, 'performance_benchmark.json')}`);
  }
}

runPerformanceBenchmark();
