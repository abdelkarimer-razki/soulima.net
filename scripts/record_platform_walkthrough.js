const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const fs = require('fs');

const OUTPUT_VIDEO = 'docs/soulima_platform_walkthrough.mp4';
const FINAL_COPY = './soulima_platform_walkthrough.mp4';
const SOUNDTRACK = 'docs/soundtrack.wav';
const FPS = 30;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log('Starting automated product walkthrough recording...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  // Start FFmpeg process
  const ffmpegArgs = [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', String(FPS),
    '-i', '-',
    ...(fs.existsSync(SOUNDTRACK) ? ['-i', SOUNDTRACK, '-c:a', 'aac', '-b:a', '192k'] : []),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    OUTPUT_VIDEO
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  ffmpeg.stderr.on('data', (d) => {
    const s = d.toString();
    if (s.includes('frame=') && s.includes('fps=')) {
      process.stdout.write('\r' + s.trim().slice(0, 80));
    }
  });

  // Setup CDP screencast with CFR 30fps timer
  const client = await page.target().createCDPSession();
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });

  let latestBuffer = null;
  let isRecording = true;

  client.on('Page.screencastFrame', async (frame) => {
    latestBuffer = Buffer.from(frame.data, 'base64');
    try {
      await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    } catch (e) {}
  });

  // CFR 30fps pump
  const pumpInterval = setInterval(() => {
    if (isRecording && latestBuffer) {
      ffmpeg.stdin.write(latestBuffer);
    }
  }, 1000 / FPS);

  // Inject Virtual Cursor and Feature Pill on document load
  await page.evaluateOnNewDocument(() => {
    window.__mouseX = 960;
    window.__mouseY = 540;

    const setupUI = () => {
      if (document.getElementById('virtual-cursor-container')) return;

      const container = document.createElement('div');
      container.id = 'virtual-cursor-container';
      container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:999999999;';

      // Cursor SVG
      const cursor = document.createElement('div');
      cursor.id = 'virtual-cursor';
      cursor.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        width: 32px;
        height: 32px;
        transform: translate(${window.__mouseX}px, ${window.__mouseY}px);
        transition: transform 0.04s linear;
        pointer-events: none;
        z-index: 999999999;
      `;
      cursor.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 28 28" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));">
          <path fill="#ffffff" stroke="#0f172a" stroke-width="2" stroke-linejoin="round" d="M3 3l7.5 21 3.5-7.5 7.5-3.5L3 3z"/>
        </svg>
      `;
      container.appendChild(cursor);

      // Feature Pill Callout (Bottom-Left)
      const pill = document.createElement('div');
      pill.id = 'feature-pill';
      pill.style.cssText = `
        position: fixed;
        bottom: 36px;
        left: 36px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(0, 229, 255, 0.4);
        box-shadow: 0 10px 25px rgba(0,0,0,0.5), 0 0 20px rgba(0, 229, 255, 0.2);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 16px;
        font-weight: 600;
        padding: 10px 22px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        gap: 12px;
        transition: all 0.4s ease;
        z-index: 999999998;
      `;
      pill.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#00e5ff;box-shadow:0 0 10px #00e5ff;"></span><span id="pill-text">Soulima Cinema Platform</span>`;
      container.appendChild(pill);

      document.documentElement.appendChild(container);

      // Remove popup overlay if present
      const dismissPopup = () => {
        const notif = document.querySelector('app-notif');
        if (notif) notif.remove();
        const backdrop = document.querySelector('.notifOverlay, .modal-backdrop');
        if (backdrop) backdrop.remove();
      };
      setInterval(dismissPopup, 500);
    };

    window.__updateVirtualCursor = (x, y) => {
      window.__mouseX = x;
      window.__mouseY = y;
      const c = document.getElementById('virtual-cursor');
      if (c) c.style.transform = `translate(${x}px, ${y}px)`;
    };

    window.__triggerClickRipple = (x, y) => {
      const ring = document.createElement('div');
      ring.style.cssText = `
        position: fixed;
        left: ${x - 20}px;
        top: ${y - 20}px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 2px solid #00e5ff;
        background: rgba(0, 229, 255, 0.35);
        pointer-events: none;
        z-index: 999999997;
        animation: virtualClickAnim 0.45s ease-out forwards;
      `;
      const style = document.createElement('style');
      style.innerHTML = `@keyframes virtualClickAnim { 0% { transform: scale(0.4); opacity: 1; } 100% { transform: scale(2.4); opacity: 0; } }`;
      document.head.appendChild(style);
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 450);
    };

    window.__setFeaturePill = (text, dotColor = '#00e5ff') => {
      const t = document.getElementById('pill-text');
      const p = document.getElementById('feature-pill');
      if (t) t.innerText = text;
      if (p) {
        p.style.transform = 'scale(1.04)';
        setTimeout(() => p.style.transform = 'scale(1)', 200);
      }
    };

    document.addEventListener('DOMContentLoaded', setupUI);
  });

  // Movement helpers
  let curMouseX = 960;
  let curMouseY = 540;

  async function moveMouseSmooth(endX, endY, durationMs = 500) {
    const steps = Math.max(12, Math.floor(durationMs / 20));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ease = (1 - Math.cos(t * Math.PI)) / 2;
      const nx = curMouseX + (endX - curMouseX) * ease;
      const ny = curMouseY + (endY - curMouseY) * ease;
      await page.evaluate((x, y) => window.__updateVirtualCursor(x, y), nx, ny);
      await sleep(durationMs / steps);
    }
    curMouseX = endX;
    curMouseY = endY;
  }

  async function clickMouse(x, y) {
    await moveMouseSmooth(x, y, 250);
    await page.evaluate((x, y) => window.__triggerClickRipple(x, y), x, y);
    await page.mouse.click(x, y);
    await sleep(250);
  }

  async function scrollSmooth(startY, endY, durationMs = 800) {
    const steps = Math.max(15, Math.floor(durationMs / 25));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ease = (1 - Math.cos(t * Math.PI)) / 2;
      const ny = startY + (endY - startY) * ease;
      await page.evaluate((y) => window.scrollTo(0, y), ny);
      await sleep(durationMs / steps);
    }
  }

  async function setPill(text) {
    await page.evaluate((txt) => window.__setFeaturePill(txt), text);
  }

  // ================= SCENARIO EXECUTION =================

  console.log('Navigating to Soulima web application...');
  await page.goto('http://localhost:4200', { waitUntil: 'networkidle2' });
  await sleep(1500);

  // ACT 1: LANDING & CINEMA CATALOG (0s - 10s)
  await setPill('Soulima Cinema Platform • Clean Dark UI');
  await moveMouseSmooth(400, 300, 1000);
  await sleep(1000);

  // Hover billboard details
  await setPill('Hero Billboard • Live TMDB Metadata & Ratings');
  await moveMouseSmooth(350, 480, 800);
  await sleep(1500);

  // Scroll down to movie rows
  await setPill('Browsing Catalog • Multi-Source Torrent Scrapers');
  await scrollSmooth(0, 480, 1000);
  await sleep(600);

  // Hover over trending posters
  await moveMouseSmooth(260, 680, 700);
  await sleep(800);
  await moveMouseSmooth(540, 680, 600);
  await sleep(800);
  await moveMouseSmooth(820, 680, 600);
  await sleep(800);

  // Scroll further to categories
  await scrollSmooth(480, 950, 900);
  await sleep(1000);
  await scrollSmooth(950, 0, 1100);
  await sleep(800);

  // ACT 2: INSTANT SEARCH WITH AUTOCOMPLETE (10s - 22s)
  await setPill('Instant Search Engine with Live Autocomplete');
  // Move to search bar
  await moveMouseSmooth(1080, 50, 800);
  await clickMouse(1080, 50);

  // Type search query
  const query = 'Inception';
  for (const ch of query) {
    await page.keyboard.type(ch);
    await sleep(140);
  }
  await sleep(1200);

  // Hover over the search result / movie card
  await setPill('Dynamic Swarm Resolution for Title');
  await moveMouseSmooth(420, 320, 800);
  await sleep(1200);

  // Click on the movie
  await setPill('Ingesting Magnet & Incompatible Audio Downmix');
  await clickMouse(420, 320);
  await sleep(2500);

  // ACT 3: STREAMING & PLAYER HUD (22s - 36s)
  await setPill('Sequential Swarm Prioritization • <2s First Frame');
  // Move mouse around player
  await moveMouseSmooth(960, 540, 1000);
  await sleep(2000);

  // Move over player controls
  await setPill('Virtual Continuous Timeline • Seeking Without Resets');
  await moveMouseSmooth(600, 920, 800); // Progress bar / controls
  await sleep(1200);

  // Hover Subtitles (CC)
  await setPill('Auto-Aligned Subtitles with ffsubsync');
  await moveMouseSmooth(1680, 920, 800);
  await sleep(1800);

  // ACT 4: OFFLINE DOWNLOADS & LOCAL LIBRARY (36s - 45s)
  await setPill('Navigating to Offline Library Manager');
  await moveMouseSmooth(420, 48, 800); // Downloads nav link
  await clickMouse(420, 48);
  await sleep(2200);

  await setPill('Offline Downloads • Client-Side Quota Management');
  await moveMouseSmooth(960, 520, 900);
  await sleep(2000);

  // ACT 5: RETURN HOME & OUTRO (45s - 48s)
  await setPill('Soulima (سوليما) • 100% Open Source P2P Streaming');
  await moveMouseSmooth(80, 48, 700); // Logo
  await clickMouse(80, 48);
  await sleep(2500);

  // Finish recording
  console.log('\nFinalizing screencast...');
  isRecording = false;
  clearInterval(pumpInterval);

  try {
    await client.send('Page.stopScreencast');
  } catch (e) {}

  ffmpeg.stdin.end();
  await new Promise(r => ffmpeg.on('close', r));
  await browser.close();

  // Copy to root directory for easy access
  if (fs.existsSync(OUTPUT_VIDEO)) {
    fs.copyFileSync(OUTPUT_VIDEO, FINAL_COPY);
    console.log(`\nPlatform walkthrough successfully generated: ${FINAL_COPY}`);
  }
})();
