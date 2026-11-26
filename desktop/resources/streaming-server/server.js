import express from 'express';
import cors from 'cors';
import WebTorrent from 'webtorrent';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
import zlib from 'zlib';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUBDL_API = 'https://api.subdl.com/api/v1/subtitles';
const SUBDL_DL = 'https://dl.subdl.com';
const YIFY_SUBS = 'https://yifysubtitles.ch';
const SUBTITLE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let subdlApiKey = process.env.SUBDL_API_KEY || '';
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  }
} catch {}
subdlApiKey = process.env.SUBDL_API_KEY || '';

function resolveFfmpegPath() {
  const candidates = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  candidates.push(path.join(os.homedir(), '.local', 'bin', 'ffmpeg'));
  candidates.push(path.join(__dirname, '../desktop/dist/linux-unpacked/resources/ffmpeg/ffmpeg'));
  candidates.push(path.join(__dirname, '../desktop/resources/ffmpeg/ffmpeg'));
  const imgioDir = path.join(os.homedir(), '.local', 'lib', 'python3.12', 'site-packages', 'imageio_ffmpeg', 'binaries');
  try {
    for (const f of fs.readdirSync(imgioDir)) {
      if (f.startsWith('ffmpeg-') && !f.endsWith('.sha256')) {
        candidates.push(path.join(imgioDir, f));
        break;
      }
    }
  } catch {}
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}
  }
  return 'ffmpeg';
}

const ffmpegPath = resolveFfmpegPath();

function resolveFfsubsyncPath() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'ffsubsync'),
    '/usr/local/bin/ffsubsync',
    '/usr/bin/ffsubsync',
  ];
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}
  }
  return null;
}

const ffsubsyncPath = resolveFfsubsyncPath();
console.log('[sync] ffsubsync:', ffsubsyncPath || 'NOT FOUND');

const CACHE_BASE_DIR = process.env.SOULIMA_CACHE_DIR || path.join(os.homedir(), '.cache', 'soulima');
try { fs.mkdirSync(CACHE_BASE_DIR, { recursive: true }); } catch {}

// Auto-sync a subtitle buffer against a video file using ffsubsync.
// Returns the synced VTT text, or null on failure.
async function autoSyncSubtitle(subBuf, videoPath) {
  if (!ffsubsyncPath) return null;
  if (!fs.existsSync(videoPath)) return null;

  const tmpDir = path.join(CACHE_BASE_DIR, 'sync');
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const pid = process.pid;
  const ts = Date.now();
  const inFile  = path.join(tmpDir, `${pid}-${ts}-in.srt`);
  const outFile = path.join(tmpDir, `${pid}-${ts}-out.srt`);

  try {
    // Convert VTT to SRT for ffsubsync
    let text = subBuf.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const isVtt = /^\s*WEBVTT/i.test(text);
    let srtText = text;
    if (isVtt) {
      srtText = text
        .replace(/^\s*WEBVTT[^\n]*\n+/i, '')
        .replace(/^(?:STYLE|NOTE|REGION)\b[\s\S]*?^\s*$/gm, '')
        // Ensure mm:ss.ttt or hh:mm:ss.ttt timestamps are converted to valid SRT hh:mm:ss,ttt
        .replace(/(?:^|\n)(?:(\d{2}):)?(\d{2}):(\d{2})[\.,](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[\.,](\d{3})/g,
          (m, h1, m1, s1, ms1, h2, m2, s2, ms2) => {
            const startH = h1 || '00';
            const endH = h2 || '00';
            return `\n${startH}:${m1}:${s1},${ms1} --> ${endH}:${m2}:${s2},${ms2}`;
          }
        );
    }
    await fs.promises.writeFile(inFile, srtText, 'utf8');

    console.log(`[sync] running ffsubsync on ${path.basename(videoPath)}…`);
    const env = { ...process.env, FFMPEG_PATH: ffmpegPath };
    await execFileAsync(
      ffsubsyncPath,
      [videoPath, '-i', inFile, '-o', outFile, '--no-fix-framerate'],
      { timeout: 120000, env }
    );

    if (!fs.existsSync(outFile)) return null;
    let synced = await fs.promises.readFile(outFile, 'utf8');
    // Convert back to VTT standard
    synced = synced.replace(/(?:^|\n)(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g, '\n$1.$2 --> $3.$4');
    synced = 'WEBVTT\n\n' + synced.trim() + '\n';
    console.log(`[sync] ffsubsync done for ${path.basename(videoPath)}`);
    return synced;
  } catch (err) {
    console.warn(`[sync] ffsubsync failed: ${err.message?.slice(0, 200)}`);
    return null;
  } finally {
    fs.promises.unlink(inFile).catch(() => {});
    fs.promises.unlink(outFile).catch(() => {});
  }
}

const BOOTSTRAP_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7000/announce',
  'wss://tracker.webtorrent.dev',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker.cyberia.is:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://ipv4.tracker.harry.lu:80/announce',
  'udp://valerie.zackptg5.com:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://tracker.leechers-paradise.org:6969/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'https://tracker.btorrent.xyz',
  'https://tracker.tamersrealm.com:443/announce',
];

const app = express();
const PORT = process.env.PORT || 3030;

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https?:\/\/([a-zA-Z0-9-]+\.)*soulima\.net(:\d+)?$/,
  /^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/,
  /^capacitor:\/\/localhost$/,
  /^app:\/\/./,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = ALLOWED_ORIGIN_PATTERNS.some(p => p.test(origin));
    callback(null, isAllowed);
  },
  credentials: true,
  exposedHeaders: ['X-Subtitle-Sync', 'X-Media-Duration', 'X-Stream-Start-Time'],
}));
app.use(express.json({ limit: '1mb' }));

const client = new WebTorrent({
  maxConns: 300,
  dht: {
    bootstrap: [
      'router.bittorrent.com:6881',
      'router.utorrent.com:6881',
      'dht.transmissionbt.com:6881',
      'dht.aelitis.com:6881'
    ]
  },
  webSeeds: true,
});
client.on('error', (err) => console.error('[webtorrent] client error:', err.message));

class BoundedMap extends Map {
  constructor(maxSize = 500) {
    super();
    this.maxSize = maxSize;
  }
  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    // Move to end for true LRU access ordering
    super.delete(key);
    super.set(key, value);
    return value;
  }
  set(key, value) {
    if (super.has(key)) {
      super.delete(key);
    } else if (this.size >= this.maxSize) {
      const oldestKey = this.keys().next().value;
      this.delete(oldestKey);
    }
    return super.set(key, value);
  }
}

function normalizeMagnet(rawMagnet) {
  if (!rawMagnet || typeof rawMagnet !== 'string') return null;
  const match = rawMagnet.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  if (!match) return null;
  const hash = match[1].toLowerCase();
  const dnMatch = rawMagnet.match(/[?&]dn=([^&]+)/i);
  const dn = dnMatch ? `&dn=${dnMatch[1]}` : '';
  const trStr = BOOTSTRAP_TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
  return {
    infoHash: hash,
    normalizedMagnet: `magnet:?xt=urn:btih:${hash}${dn}&${trStr}`,
  };
}

const streams = new Map();
const prefetches = new Map();
const inProgressSyncs = new Set();
const failedSyncs = new BoundedMap(500);

function getTempDir(id) {
  return path.join(CACHE_BASE_DIR, 'stream', id);
}

function pickVideoFile(files, season, episode) {
  if (!Array.isArray(files) || !files.length) return null;
  const videoExts = ['.mp4', '.mkv', '.webm', '.avi', '.mov'];
  const videoFiles = files.filter(f => videoExts.some(ext => f.name.toLowerCase().endsWith(ext)));
  if (!videoFiles.length) return null;

  // Filter out samples, extras, and featurettes unless no main files exist
  const nonSamples = videoFiles.filter(f => {
    const n = f.name.toLowerCase();
    return !n.includes('sample') && !n.includes('trailer') && !n.includes('featurette') &&
           !n.includes('bonus') && !n.includes('behind the scenes') && (f.length > 40 * 1024 * 1024 || videoFiles.length === 1);
  });
  const candidates = nonSamples.length ? nonSamples : videoFiles;

  // If season and episode are specified, match specific episode
  if (season != null && episode != null) {
    try {
      const s = Number(season);
      const e = Number(episode);

      // 1. Precise season & episode patterns (including multi-episode ranges like S01E01-E02, S01E01-02, 1x01-02)
      const exactPatterns = [
        new RegExp(`s0*${s}[- ._]*e0*${e}(?:[- ._]+e?\\d+)?\\b`, 'i'),
        new RegExp(`s0*${s}[- ._]*e\\d+[- ._]+e?0*${e}\\b`, 'i'),
        new RegExp(`\\b${s}x0*${e}(?:-\\d+)?\\b`, 'i'),
        new RegExp(`\\b${s}x\\d+-0*${e}\\b`, 'i'),
        new RegExp(`(?:season|s)[- ._]*0*${s}[\\s\\S]*?\\b(?:episode|ep|e)[- ._]*0*${e}\\b`, 'i'),
      ];
      for (const pat of exactPatterns) {
        const match = candidates.find(f => pat.test(f.name) || pat.test(f.path || ''));
        if (match) return match;
      }

      // 2. Fallback: Episode number with season folder/path verification
      const seasonFolderCheck = new RegExp(`(?:season|s)[- ._]*0*${s}\\b`, 'i');
      const episodePatterns = [
        new RegExp(`\\bepisode[- ._]*0*${e}\\b`, 'i'),
        new RegExp(`\\b0*${e}[- ._]+of[- ._]+`, 'i'),
        new RegExp(`\\be0*${e}\\b`, 'i'),
      ];
      for (const pat of episodePatterns) {
        const match = candidates.find(f => {
          const fullPath = (f.path || '') + '/' + f.name;
          // Ensure that if season folder exists in path, it matches our target season
          if (seasonFolderCheck.test(fullPath)) return pat.test(f.name);
          // Only allow standalone episode match if no conflicting season exists in the path
          const otherSeason = fullPath.match(/s0*(\d+)/i) || fullPath.match(/season[- ._]*(\d+)/i);
          if (otherSeason && Number(otherSeason[1]) !== s) return false;
          return pat.test(f.name);
        });
        if (match) return match;
      }
    } catch (err) {
      console.warn('[stream] pickVideoFile episode matching error:', err.message);
    }
  }

  // Default: Choose the largest video file (the main feature)
  return candidates.sort((a, b) => b.length - a.length)[0];
}

app.post('/api/stream', async (req, res) => {
  const { magnet, season, episode } = req.body;
  if (!magnet) return res.status(400).json({ error: 'magnet required' });
  console.log('[stream] POST received magnet:', magnet.slice(0, 80));
  
  const norm = normalizeMagnet(magnet);
  if (!norm) {
    return res.status(400).json({ error: 'invalid magnet link' });
  }
  const { infoHash, normalizedMagnet: enrichedMagnet } = norm;

  const id = crypto.randomBytes(6).toString('hex');
  let newlyCreatedTorrent = null;

  try {
    let existing = infoHash ? await client.get(`magnet:?xt=urn:btih:${infoHash}`) : null;
    if (existing && (existing.destroyed || existing._destroyed)) {
      existing = null;
    }
    if (existing) {
      if (!existing.files.length) {
        await new Promise((resolve, reject) => {
          const onMeta = () => { existing.removeListener('error', onErr); resolve(); };
          const onErr = (err) => { existing.removeListener('metadata', onMeta); reject(err); };
          existing.once('metadata', onMeta);
          existing.once('error', onErr);
        });
      }
      const file = pickVideoFile(existing.files, season, episode);
      if (!file) {
        return res.status(404).json({ error: 'no playable video file in torrent' });
      }

      try {
        if (existing.pieces?.length) {
          existing.deselect(0, existing.pieces.length - 1, 0);
          file.select();
          const startP = typeof file._startPiece === 'number' ? file._startPiece : 0;
          const endP = typeof file._endPiece === 'number' ? file._endPiece : (existing.pieces.length - 1);
          existing.critical(startP, Math.min(startP + 25, endP));
          if (endP - startP > 25) existing.critical(Math.max(startP, endP - 8), endP);
        }
      } catch {}

      streams.set(id, { id, torrent: existing, file, createdAt: Date.now(), duration: 0 });
      startDurationProbe(id);
      const base = `${req.protocol}://${req.get('host')}`;
      return res.json({
        id,
        streamUrl: `${base}/api/stream/${id}`,
        statusUrl: `${base}/api/stream/${id}/status`,
        fileName: file.name,
        size: file.length,
      });
    }

    const timeoutMs = 12000;
    const torrent = await new Promise((resolve, reject) => {
      let t;
      try {
        t = client.add(enrichedMagnet, {
          path: getTempDir(id),
          announce: BOOTSTRAP_TRACKERS,
          maxConns: 300,
          strategy: 'sequential',
        });
        newlyCreatedTorrent = t;
      } catch (e) {
        reject(new Error('failed to add torrent'));
        return;
      }
      let earlyTimer = null;
      const onMeta = () => {
        clearTimeout(timeout);
        if (earlyTimer) clearTimeout(earlyTimer);
        resolve(t);
      };
      const onErr = (err) => {
        clearTimeout(timeout);
        if (earlyTimer) clearTimeout(earlyTimer);
        t.destroy();
        reject(err);
      };

      // Fast failover if torrent has 0 peers after 10s (gives DHT/trackers time to connect)
      earlyTimer = setTimeout(() => {
        if (!t.metadata && t.numPeers === 0) {
          t.removeListener('metadata', onMeta);
          t.removeListener('error', onErr);
          t.destroy();
          reject(new Error('no peers found (fast failover)'));
        }
      }, 10000);

      const timeout = setTimeout(() => {
        if (earlyTimer) clearTimeout(earlyTimer);
        t.removeListener('metadata', onMeta);
        t.removeListener('error', onErr);
        t.destroy();
        reject(new Error('metadata timeout'));
      }, timeoutMs);
      t.once('metadata', onMeta);
      t.once('error', onErr);
      t.on('warning', () => {});
    });

    const file = pickVideoFile(torrent.files, season, episode);

    if (!file) {
      torrent.destroy();
      return res.status(404).json({ error: 'no playable video file in torrent' });
    }

    try {
      if (torrent.pieces?.length) {
        torrent.deselect(0, torrent.pieces.length - 1, 0);
        file.select();
        const startP = typeof file._startPiece === 'number' ? file._startPiece : 0;
        const endP = typeof file._endPiece === 'number' ? file._endPiece : (torrent.pieces.length - 1);
        torrent.critical(startP, Math.min(startP + 25, endP));
        if (endP - startP > 25) torrent.critical(Math.max(startP, endP - 8), endP);
      }
    } catch {}

    streams.set(id, { id, torrent, file, createdAt: Date.now(), duration: 0 });
    startDurationProbe(id);
    const base = `${req.protocol}://${req.get('host')}`;

    res.json({
      id,
      streamUrl: `${base}/api/stream/${id}`,
      statusUrl: `${base}/api/stream/${id}/status`,
      fileName: file.name,
      size: file.length,
    });
  } catch (err) {
    if (newlyCreatedTorrent && !streams.has(id)) {
      try { newlyCreatedTorrent.destroy(); } catch {}
    }
    console.error('[stream] POST error:', err.message || err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stream/prefetch', async (req, res) => {
  const { magnet } = req.body;
  const norm = normalizeMagnet(magnet);
  if (!norm) {
    return res.status(400).json({ error: 'invalid magnet' });
  }
  const { infoHash, normalizedMagnet: enrichedMagnet } = norm;

  try {
    let existing = client.get(`magnet:?xt=urn:btih:${infoHash}`);
    if (!existing) {
      existing = client.add(enrichedMagnet, {
        path: path.join(CACHE_BASE_DIR, 'prefetch', infoHash),
        announce: BOOTSTRAP_TRACKERS,
        maxConns: 100,
        strategy: 'sequential',
      });
      // When metadata arrives, immediately deselect all pieces so prefetching only
      // caches swarm discovery and metadata without downloading unrequested pieces.
      existing.once('metadata', () => {
        try {
          if (existing.pieces?.length) {
            existing.deselect(0, existing.pieces.length - 1, 0);
          }
        } catch {}
      });
    }
    prefetches.set(infoHash, { torrent: existing, createdAt: Date.now() });
    res.json({ ok: true, infoHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── On-the-fly MKV remux ────────────────────────────────────────────────────
// Chromium's <video> element can't decode several codecs commonly found in
// series MKV files (DTS/EAC3 audio, HEVC video). We remux MKV -> fragmented MP4
// through ffmpeg: copy the video when possible (fast), transcode audio to AAC
// (or video to H.264 when the codec is unsupported). The partially-downloaded
// torrent file is fed to ffmpeg via stdin so playback starts immediately.

let ffmpegUsable = null;
async function ensureFfmpegUsable() {
  if (ffmpegUsable !== null) return ffmpegUsable;
  ffmpegUsable = await new Promise((resolve) => {
    try {
      const p = spawn(ffmpegPath, ['-version'], { stdio: 'ignore' });
      const to = setTimeout(() => { try { p.kill(); } catch {} resolve(true); }, 4000);
      p.once('error', () => { clearTimeout(to); resolve(false); });
      p.once('spawn', () => { clearTimeout(to); try { p.kill(); } catch {} resolve(true); });
    } catch { resolve(false); }
  });
  console.log('[mkv] ffmpeg usable:', ffmpegUsable);
  return ffmpegUsable;
}

const FFMPEG_VIDEO_COPY = new Set(['h264', 'vp9', 'vp8', 'av1']);
const FFMPEG_AUDIO_COPY = new Set(['aac', 'mp3']);

function fileBytesOnDisk(sourcePath) {
  try { return fs.statSync(sourcePath).size; } catch { return 0; }
}

async function waitForFileSize(sourcePath, minBytes, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fileBytesOnDisk(sourcePath) >= minBytes) return true;
    await sleep(500);
  }
  return false;
}

// Probe the real total duration once enough of the file is on disk, so the
// player can show the full runtime even though remuxed (fragmented MP4) video
// only exposes a progressive duration to the browser.
function startDurationProbe(id) {
  const s = streams.get(id);
  if (!s) return;
  const sourcePath = path.join(s.torrent.path, s.file.path);
  waitForFileSize(sourcePath, 512 * 1024, 20000).then(() =>
    probeCodecs(sourcePath).then(cfg => {
      const cur = streams.get(id);
      if (cur && cfg && cfg.duration > 0) {
        cur.duration = cfg.duration;
      } else if (cur && (!cfg || !cfg.duration)) {
        setTimeout(() => {
          if (!streams.has(id)) return;
          probeCodecs(sourcePath).then(c2 => {
            const c = streams.get(id);
            if (c && c2 && c2.duration > 0) c.duration = c2.duration;
          }).catch(() => {});
        }, 10000);
      }
    }).catch(() => {})
  );
}

// Probe codecs from the (possibly partial) file header using `ffmpeg -i`.
async function probeCodecs(sourcePath) {
  try {
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ['-hide_banner', '-probesize', '1M', '-analyzeduration', '1M', '-i', sourcePath],
      { timeout: 20000 }
    ).catch(e => ({ stderr: e.stderr || e.message || '' }));
    const video = stderr.match(/Stream #\d+:\d+[^\n]*: Video: (\S+)/i);
    const audio = stderr.match(/Stream #\d+:\d+[^\n]*: Audio: (\S+)/i);
    const dur = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    return {
      videoCodec: (video ? video[1] : '').toLowerCase(),
      audioCodec: (audio ? audio[1] : '').toLowerCase(),
      hasAudio: !!audio,
      duration: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0,
    };
  } catch {
    return null;
  }
}

function spawnRemux(res, s, startTime, cfg, sourceName) {
  const isHevc = /hevc|x265|h265|265/i.test(sourceName) || cfg.videoCodec === 'hevc';
  const copyVideo = !isHevc && !!cfg.videoCodec && FFMPEG_VIDEO_COPY.has(cfg.videoCodec);
  // Only copy audio when the probe positively identified a browser-safe codec.
  // If the probe could not detect audio (common on partially-downloaded files),
  // transcoding to AAC guarantees audible sound; copying DTS/EAC3/AC3/Opus into
  // an MP4 yields silent video in Chromium.
  const copyAudio = !!cfg.hasAudio && FFMPEG_AUDIO_COPY.has(cfg.audioCodec);

  const inputUrl = `http://127.0.0.1:${PORT}/api/raw-stream/${s.id}`;
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-probesize', '1M',
    '-analyzeduration', '1M',
    '-seekable', '1',
    '-multiple_requests', '1',
  ];

  if (startTime > 0) {
    args.push('-ss', String(startTime));
    const duration = s.duration || cfg.duration || 0;
    if (s.torrent?.pieceLength) {
      const fileOffset = s.file.offset || 0;
      const pLen = s.torrent.pieceLength;
      const approxByte = duration > 0
        ? Math.floor((startTime / duration) * s.file.length)
        : Math.floor((startTime / 7200) * s.file.length); // 2hr nominal fallback
      const targetPiece = Math.floor((approxByte + fileOffset) / pLen);
      try {
        s.torrent.critical(targetPiece, Math.min(targetPiece + 35, s.file._endPiece || (s.torrent.pieces.length - 1)));
      } catch {}
    }
  }

  args.push('-i', inputUrl);

  if (copyVideo) args.push('-c:v', 'copy');
  else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p');

  if (copyAudio) args.push('-c:a', 'copy');
  else args.push('-c:a', 'aac', '-b:a', '192k');

  args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');

  console.log(`[mkv] remux ${sourceName} startTime=${startTime}s video=${cfg.videoCodec || '?'} audio=${cfg.audioCodec || '?'} (${copyVideo ? 'copy' : 'h264'} / ${copyAudio ? 'copy' : 'aac'})`);

  const proc = spawn(ffmpegPath, args);
  s.ffmpegProc = proc;
  proc.stdout.pipe(res);
  proc.stderr.on('data', d => {
    const t = d.toString().trim();
    if (t && !/^frame=/.test(t)) console.log('[mkv]', t);
  });
  proc.on('error', (err) => {
    console.error('[mkv] spawn error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'transcode unavailable' });
    } else {
      res.destroy();
    }
  });
  proc.on('close', (code) => {
    if (s.ffmpegProc === proc) s.ffmpegProc = null;
    if (code !== 0 && !res.writableEnded) res.destroy();
  });
  res.on('close', () => {
    try { proc.kill('SIGKILL'); } catch {}
  });

  // Fragmented MP4 gives the browser a progressive duration; expose the real
  // total so the client can show the full length even before it's buffered.
  const headers = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'none',
    'Cache-Control': 'no-store, no-cache',
  };
  const effectiveDur = s.duration || cfg.duration || 0;
  if (effectiveDur > 0) headers['X-Media-Duration'] = String(effectiveDur);
  if (startTime > 0) headers['X-Stream-Start-Time'] = String(startTime);
  res.writeHead(200, headers);
  return true;
}

async function spawnFileRemux(res, filePath, startTime, cfg, sourceName) {
  const isHevc = /hevc|x265|h265|265/i.test(sourceName) || cfg.videoCodec === 'hevc';
  const copyVideo = !isHevc && !!cfg.videoCodec && FFMPEG_VIDEO_COPY.has(cfg.videoCodec);
  const copyAudio = !!cfg.hasAudio && FFMPEG_AUDIO_COPY.has(cfg.audioCodec);

  const args = [
    '-hide_banner',
    '-loglevel', 'error',
  ];
  if (startTime > 0) {
    args.push('-ss', String(startTime));
  }
  args.push('-i', filePath);

  if (copyVideo) args.push('-c:v', 'copy');
  else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p');

  if (copyAudio) args.push('-c:a', 'copy');
  else args.push('-c:a', 'aac', '-b:a', '192k');

  args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');

  console.log(`[file-remux] ${sourceName} startTime=${startTime}s video=${cfg.videoCodec || '?'} audio=${cfg.audioCodec || '?'} (${copyVideo ? 'copy' : 'h264'} / ${copyAudio ? 'copy' : 'aac'})`);

  const proc = spawn(ffmpegPath, args);
  proc.stdout.pipe(res);
  proc.stderr.on('data', d => {
    const t = d.toString().trim();
    if (t && !/^frame=/.test(t)) console.log('[file-remux]', t);
  });
  proc.on('error', (err) => {
    console.error('[file-remux] spawn error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'transcode unavailable' });
    else res.destroy();
  });
  proc.on('close', (code) => {
    if (code !== 0 && !res.writableEnded) res.destroy();
  });
  res.on('close', () => {
    try { proc.kill('SIGKILL'); } catch {}
  });

  const headers = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'none',
    'Cache-Control': 'no-store, no-cache',
  };
  const effectiveDur = cfg.duration || 0;
  if (effectiveDur > 0) headers['X-Media-Duration'] = String(effectiveDur);
  if (startTime > 0) headers['X-Stream-Start-Time'] = String(startTime);
  res.writeHead(200, headers);
  return true;
}

async function handleMkvStream(req, res, s, startTime) {
  const { file, torrent } = s;
  const sourcePath = path.join(torrent.path, file.path);

  if (!s.mkvConfig) {
    await waitForFileSize(sourcePath, 512 * 1024, 15000);
    s.mkvConfig = (await probeCodecs(sourcePath)) || { videoCodec: '', audioCodec: '', hasAudio: true, duration: 0 };
  }
  return spawnRemux(res, s, startTime, s.mkvConfig, file.name);
}

// Non-MKV containers (mp4/avi/webm): remux when the probe positively
// identified a non-browser-safe audio codec (AC3/DTS/EAC3/TrueHD).
async function handleUnsafeAudioStream(req, res, s, startTime) {
  const { file, torrent } = s;
  const sourcePath = path.join(torrent.path, file.path);

  if (!s.mkvConfig) {
    if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).size < 1024 * 1024) {
      return false;
    }
    s.mkvConfig = (await probeCodecs(sourcePath)) || null;
  }
  const cfg = s.mkvConfig;
  if (!cfg) return false;

  // When client requests seeking (startTime > 0), remux with FFmpeg so -ss seeks to exact second
  if (startTime > 0) {
    return spawnRemux(res, s, startTime, cfg, file.name);
  }

  if (!cfg.hasAudio) return false;
  if (['aac', 'mp3', 'opus', 'vorbis'].includes(cfg.audioCodec)) return false;
  return spawnRemux(res, s, startTime, cfg, file.name);
}

// Raw torrent byte stream with full HTTP Range request support for FFmpeg and direct consumers
app.get('/api/raw-stream/:id', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s || !s.file || !s.torrent) return res.status(404).json({ error: 'stream not found' });

  const { file, torrent } = s;
  const range = req.headers.range;
  const pLen = torrent.pieceLength || 1048576;
  const fileOffset = file.offset || 0;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;

    // Critical piece prioritization for seeks
    const startPiece = Math.floor((start + fileOffset) / pLen);
    const endPiece = Math.floor((Math.min(end, file.length - 1) + fileOffset) / pLen);
    try {
      torrent.critical(startPiece, Math.min(endPiece, startPiece + 25));
    } catch {}

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${file.length}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    const rs = file.createReadStream({ start, end });
    rs.pipe(res);
    res.on('close', () => { rs.destroy(); });
  } else {
    res.writeHead(200, {
      'Content-Length': file.length,
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
    });
    const rs = file.createReadStream();
    rs.pipe(res);
    res.on('close', () => { rs.destroy(); });
  }
});

app.get('/api/stream/:id', async (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'stream not found' });

  const { file, torrent } = s;
  const id = req.params.id;
  const startTime = Math.max(0, parseFloat(req.query.startTime || req.query.t || 0) || 0);

  const isMkv = file.name.toLowerCase().endsWith('.mkv');
  if (ffmpegUsable === null) await ensureFfmpegUsable();
  if (ffmpegUsable) {
    const handled = isMkv
      ? await handleMkvStream(req, res, s, startTime).catch(() => false)
      : await handleUnsafeAudioStream(req, res, s, startTime).catch(() => false);
    if (handled) return;
  }

  const range = req.headers.range;
  const mime = file.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4';

  console.log(`[stream] GET /api/stream/${id} range=${range || '(none)'} downloaded=${(torrent.downloaded / 1048576).toFixed(1)}MB peers=${torrent.numPeers}`);

  let sent = 0;

  const pipeStream = (start, end) => {
    try {
      if (file._destroyed || file.destroyed || !torrent || torrent.destroyed) {
        if (!res.headersSent) res.status(410).end();
        return;
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': mime,
        'Cache-Control': 'no-cache',
      });
      const rs = file.createReadStream({ start, end });
      rs.on('data', (chunk) => { sent += chunk.length; });
      rs.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      rs.pipe(res);
      res.on('close', () => { rs.destroy(); });
    } catch (err) {
      console.warn(`[stream] pipeStream error: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
    }
  };

  const done = () => {
    console.log(`[stream] ${id} client closed after sent=${(sent / 1048576).toFixed(2)}MB`);
  };
  res.on('close', done);

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;

    // Critical piece prioritization for seeks
    if (torrent && torrent.pieceLength) {
      const pLen = torrent.pieceLength;
      const fileOffset = file.offset || 0;
      const startPiece = Math.floor((start + fileOffset) / pLen);
      const endPiece = Math.floor((Math.min(end, file.length - 1) + fileOffset) / pLen);
      try {
        torrent.critical(startPiece, Math.min(endPiece, startPiece + 25));
      } catch {}
    }

    pipeStream(start, Math.min(end, file.length - 1));
  } else {
    res.writeHead(200, {
      'Content-Length': file.length,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    const rs = file.createReadStream();
    rs.on('data', (chunk) => { sent += chunk.length; });
    rs.on('error', () => {});
    rs.pipe(res);
  }
});

function toSrt(buf) {
  let text = decodeSubtitleText(buf);
  const isVtt = /^\s*WEBVTT/i.test(text);
  text = sanitizeSubtitleText(text);
  if (isVtt) {
    text = text.replace(/WEBVTT[\s\S]*?^\s*$/m, '');
    text = text.replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2');
  }
  return text;
}

function shiftSrtTimestamps(srtText, offsetSec) {
  if (!offsetSec || isNaN(offsetSec) || offsetSec === 0) return srtText;
  const offsetMs = Math.round(offsetSec * 1000);

  function shiftTime(tStr) {
    const parts = tStr.split(/[:,]/);
    if (parts.length < 4) return tStr;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    const ms = parseInt(parts[3], 10);
    let totalMs = (h * 3600 + m * 60 + s) * 1000 + ms + offsetMs;
    if (totalMs < 0) totalMs = 0;
    const nH = Math.floor(totalMs / 3600000);
    totalMs %= 3600000;
    const nM = Math.floor(totalMs / 60000);
    totalMs %= 60000;
    const nS = Math.floor(totalMs / 1000);
    const nMs = totalMs % 1000;
    return `${String(nH).padStart(2, '0')}:${String(nM).padStart(2, '0')}:${String(nS).padStart(2, '0')},${String(nMs).padStart(3, '0')}`;
  }

  return srtText.replace(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/g, (m, start, end) => {
    return `${shiftTime(start)} --> ${shiftTime(end)}`;
  });
}

async function getSubtitleBufferForMux(s, subtitleId) {
  const cacheKeySync = `sync:${s.id}:${subtitleId}`;
  const cached = subtitleCache.get(cacheKeySync);
  if (cached?.buf) return cached.buf;
  return resolveSubtitleBuffer(subtitleId);
}

async function muxWithSubtitle(req, res, s, fileId, lang, offsetSec) {
  const { torrent, file } = s;
  const sourcePath = path.join(torrent.path, file.path);
  if (!fs.existsSync(sourcePath)) return false;
  const subBuf = await getSubtitleBufferForMux(s, fileId);
  if (!subBuf) return false;
  let srt = toSrt(subBuf);
  if (offsetSec) srt = shiftSrtTimestamps(srt, offsetSec);
  if (!srt.trim()) return false;
  const tmpSub = path.join(getTempDir(req.params.id), `.soulima-subs-${process.pid}.srt`);
  await fs.promises.writeFile(tmpSub, srt);
  const baseName = file.name.replace(/\.(mkv|mp4|webm|avi)$/i, '') || 'video';
  const outName = `${baseName} (${(lang || 'und').toUpperCase()}).mkv`.replace(/[^\w.\- ()]/g, '_');
  console.log(`[mux] ${file.name} + ${fileId} (${lang || 'und'}, offset=${offsetSec || 0}s) -> ${outName}`);
  try {
    const args = [
      '-y', '-loglevel', 'error',
      '-i', sourcePath,
      '-i', tmpSub,
      '-map', '0:v:0', '-map', '0:a:0?', '-map', '1:0',
      '-c', 'copy', '-c:s', 'srt',
      '-disposition:s:0', 'default',
      '-metadata:s:s:0', `language=${lang || 'und'}`,
      '-f', 'matroska', 'pipe:1',
    ];
    res.writeHead(200, {
      'Content-Disposition': `attachment; filename="${outName}"`,
      'Content-Type': 'video/x-matroska',
      'Cache-Control': 'no-cache',
    });
    const proc = spawn(ffmpegPath, args);
    proc.stdout.pipe(res);
    proc.stderr.on('data', d => console.error('[mux]', d.toString().trim()));
    proc.on('error', (err) => {
      console.error('[mux] spawn error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'mux failed' });
      else res.destroy();
    });
    proc.on('close', (code) => {
      if (code !== 0 && !res.writableEnded) {
        console.error('[mux] ffmpeg exited', code);
        res.destroy();
      }
      fs.promises.unlink(tmpSub).catch(() => {});
    });
    return true;
  } catch (err) {
    console.error('[mux] failed:', err.message);
    fs.promises.unlink(tmpSub).catch(() => {});
    return false;
  }
}

/* ─── Tracked downloads with progress ──────────────────────────────────────── */
const downloads = new Map();          // downloadId -> state
const downloadsByStream = new Map();  // streamId -> Set<downloadId>
const DOWNLOADS_DIR = path.join(CACHE_BASE_DIR, 'downloads');

/* ─── Persistent media library (private folder inside the app) ─────────────── */
// Desktop app passes MEDIA_DIR = userData/media via env. Falls back to a
// per-user hidden folder so completed downloads live on disk instead of only
// in the browser cache.
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(os.homedir(), '.soulima', 'media');
const MEDIA_KEEP_MS = 60 * 60 * 1000; // keep finished downloads around long enough to move into library

/* ─── Daily download budget ──────────────────────────────────────────────────── */
// Total bytes that may be downloaded per calendar day. Configurable via the
// DOWNLOAD_BUDGET_GB env var (desktop app / user preference). Usage persists in
// the media folder so the budget survives server restarts.
const DOWNLOAD_BUDGET_GB = parseFloat(process.env.DOWNLOAD_BUDGET_GB || '15');
const DOWNLOAD_BUDGET_BYTES = Math.max(0, DOWNLOAD_BUDGET_GB * 1024 * 1024 * 1024);
const BUDGET_FILE = path.join(MEDIA_DIR, 'usage.json');

function budgetDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let budgetState = { date: budgetDayKey(), bytes: 0 };

async function loadBudget() {
  try {
    const raw = await fs.promises.readFile(BUDGET_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.date === budgetDayKey()) {
      budgetState = { date: parsed.date, bytes: Number(parsed.bytes) || 0 };
    }
  } catch {}
}

function saveBudget() {
  fs.promises.mkdir(MEDIA_DIR, { recursive: true })
    .then(() => fs.promises.writeFile(BUDGET_FILE, JSON.stringify(budgetState)))
    .catch(() => {});
}

function budgetUsed() {
  if (budgetState.date !== budgetDayKey()) {
    budgetState = { date: budgetDayKey(), bytes: 0 };
    saveBudget();
  }
  return budgetState.bytes;
}

function budgetRemaining() {
  return Math.max(0, DOWNLOAD_BUDGET_BYTES - budgetUsed());
}

function addBudget(bytes) {
  if (budgetState.date !== budgetDayKey()) budgetState = { date: budgetDayKey(), bytes: 0 };
  budgetState.bytes += Math.max(0, bytes);
  saveBudget();
}

async function waitForFileDone(s, state) {
  const { file } = s;
  if (file.downloaded >= file.length) return true;
  return new Promise((resolve) => {
    let iv = null;
    const timeout = setTimeout(() => {
      if (iv) clearInterval(iv);
      resolve(false);
    }, 60 * 60 * 1000);
    const update = () => {
      state.downloaded = file.downloaded;
      state.progress = file.length ? Math.min(99, (file.downloaded / file.length) * 100) : 0;
      if (file.downloaded >= file.length) {
        clearTimeout(timeout);
        if (iv) clearInterval(iv);
        resolve(true);
      }
    };
    iv = setInterval(update, 1000);
    file.once('done', () => {
      clearTimeout(timeout);
      if (iv) clearInterval(iv);
      state.downloaded = file.length;
      state.progress = 99;
      resolve(true);
    });
  });
}

async function copyToFile(s, state) {
  const { file } = s;
  return new Promise((resolve, reject) => {
    const rs = file.createReadStream();
    const ws = fs.createWriteStream(state.outFile);
    rs.on('error', reject);
    ws.on('error', reject);
    rs.on('data', () => {
      state.downloaded = file.downloaded;
      state.progress = file.length ? Math.min(100, (file.downloaded / file.length) * 100) : 0;
    });
    ws.on('finish', resolve);
    rs.pipe(ws);
  });
}

// Mux a subtitle into a complete copy of the video, writing to outFile.
async function muxToFile(s, outFile, subtitleId, lang, offsetSec, onProgress) {
  const { torrent, file } = s;
  const sourcePath = path.join(torrent.path, file.path);
  const subBuf = await getSubtitleBufferForMux(s, subtitleId);
  if (!subBuf) throw new Error('subtitle fetch failed');
  let srt = toSrt(subBuf);
  if (offsetSec) srt = shiftSrtTimestamps(srt, offsetSec);
  if (!srt.trim()) throw new Error('empty subtitle');
  const tmpSub = path.join(getTempDir(s.id), `.soulima-mux-subs-${process.pid}-${Date.now()}.srt`);
  await fs.promises.writeFile(tmpSub, srt);

  const baseName = file.name.replace(/\.(mkv|mp4|webm|avi)$/i, '') || 'video';
  const outName = `${baseName} (${(lang || 'und').toUpperCase()}).mkv`.replace(/[^\w.\- ()]/g, '_');
  const outPath = path.join(path.dirname(outFile), outName);
  const probed = await probeCodecs(sourcePath).catch(() => null);
  const duration = probed?.duration || 0;

  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error', '-nostats',
      '-progress', 'pipe:1',
      '-i', sourcePath,
      '-i', tmpSub,
      '-map', '0:v:0', '-map', '0:a:0?', '-map', '1:0',
      '-c', 'copy', '-c:s', 'srt',
      '-disposition:s:0', 'default',
      '-metadata:s:s:0', `language=${lang || 'und'}`,
      '-f', 'matroska',
      outPath,
    ];
    const proc = spawn(ffmpegPath, args);
    let progressBuf = '';
    proc.stdout.on('data', (d) => {
      progressBuf += d.toString();
      let idx;
      while ((idx = progressBuf.indexOf('\n')) !== -1) {
        const line = progressBuf.slice(0, idx).trim();
        progressBuf = progressBuf.slice(idx + 1);
        const m = line.match(/^out_time_us=(\d+)$/);
        if (m && onProgress && duration > 0) {
          onProgress(Math.min(100, (Number(m[1]) / 1e6 / duration) * 100));
        }
      }
    });
    proc.stderr.on('data', (d) => {
      const t = d.toString().trim();
      if (t) console.error('[mux]', t);
    });
    proc.on('error', (err) => {
      fs.promises.unlink(tmpSub).catch(() => {});
      reject(err);
    });
    proc.on('close', (code) => {
      fs.promises.unlink(tmpSub).catch(() => {});
      if (code !== 0) reject(new Error(`ffmpeg mux exited ${code}`));
      else resolve(outPath);
    });
  });
}

async function startDownloadTask(s, state, subtitleId, lang, offsetSec) {
  if (subtitleId) {
    state.status = 'downloading';
    state.message = 'Downloading video…';
    const done = await waitForFileDone(s, state);
    if (!done) throw new Error('Source download timed out');
    state.status = 'muxing';
    state.message = 'Embedding subtitles…';
    state.progress = 0;
    const outPath = await muxToFile(s, state.outFile, subtitleId, lang, offsetSec, (p) => {
      state.progress = p;
    });
    state.outFile = outPath;
  } else {
    state.status = 'downloading';
    state.message = 'Downloading…';
    await copyToFile(s, state);
  }
  state.status = 'complete';
  state.progress = 100;
  state.message = 'Download complete';
  addBudget(state.total || 0);
  finishDownload(state);
}

function finishDownload(state) {
  const set = downloadsByStream.get(state.streamId);
  if (set) {
    set.delete(state.downloadId);
    if (!set.size) downloadsByStream.delete(state.streamId);
  }
  const s = streams.get(state.streamId);
  if (s) {
    s.downloading = false;
    if (s.pendingDestroy) {
      let shared = false;
      for (const [otherId, otherS] of streams.entries()) {
        if (otherId !== state.streamId && otherS.torrent === s.torrent) {
          shared = true;
          break;
        }
      }
      if (!shared && s.torrent) {
        try { s.torrent.destroy(); } catch {}
      }
      streams.delete(state.streamId);
    }
  } else if (state.torrent) {
    let shared = false;
    for (const otherS of streams.values()) {
      if (otherS.torrent === state.torrent) {
        shared = true;
        break;
      }
    }
    if (!shared) {
      try { state.torrent.destroy(); } catch {}
    }
  }
  // Clean the temp files after a grace period so the user can still fetch them
  // (or the app can move them into the persistent media library).
  setTimeout(() => {
    fs.promises.rm(path.dirname(state.outFile), { recursive: true, force: true }).catch(() => {});
    downloads.delete(state.downloadId);
  }, MEDIA_KEEP_MS);
}

app.get('/api/stream/:id/download', async (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'stream not found' });

  const { file } = s;
  const subtitleId = req.query.subtitle ? String(req.query.subtitle) : '';
  const lang = req.query.lang ? String(req.query.lang) : '';
  const offsetSec = parseFloat(req.query.offset) || 0;

  if (req.query.tracked === '1') {
    const used = budgetUsed();
    if (used + file.length > DOWNLOAD_BUDGET_BYTES) {
      return res.status(429).json({
        error: 'Daily download budget exceeded',
        budget: {
          limit: DOWNLOAD_BUDGET_BYTES,
          used,
          remaining: budgetRemaining(),
          date: budgetState.date,
        },
      });
    }
    const downloadId = crypto.randomBytes(6).toString('hex');
    const outFile = path.join(DOWNLOADS_DIR, downloadId, file.name.replace(/[^\w.\- ]/g, '_'));
    await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
    const state = {
      downloadId,
      streamId: req.params.id,
      torrent: s.torrent,
      outFile,
      status: 'starting',
      progress: 0,
      downloaded: 0,
      total: file.length,
      message: 'Preparing…',
      error: null,
      startedAt: Date.now(),
    };
    downloads.set(downloadId, state);
    if (!downloadsByStream.has(req.params.id)) downloadsByStream.set(req.params.id, new Set());
    downloadsByStream.get(req.params.id).add(downloadId);
    s.downloading = true;

    startDownloadTask(s, state, subtitleId, lang, offsetSec).catch((err) => {
      console.error('[download] failed:', err.message);
      state.status = 'error';
      state.error = err.message;
      state.message = 'Download failed';
      finishDownload(state);
    });
    return res.json({ downloadId });
  }

  if (subtitleId && s.torrent.done) {
    try {
      const ok = await muxWithSubtitle(req, res, s, subtitleId, lang, offsetSec);
      if (ok) return;
    } catch (err) {
      console.error('[mux] mux failed, falling back to raw:', err.message);
    }
  }

  const mime = file.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4';
  const safeName = file.name.replace(/[^\w.\- ]/g, '_');
  console.log(`[stream] GET /api/stream/${req.params.id}/download name=${safeName} size=${(file.length / 1048576).toFixed(1)}MB`);

  res.writeHead(200, {
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'Content-Type': mime,
    'Content-Length': file.length,
    'Cache-Control': 'no-cache',
  });
  const rs = file.createReadStream();
  rs.on('error', () => {});
  rs.pipe(res);
});

app.get('/api/downloads/:id/status', (req, res) => {
  const d = downloads.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'download not found' });
  res.json({
    downloadId: d.downloadId,
    status: d.status,
    progress: Math.round(d.progress),
    downloaded: d.downloaded,
    total: d.total,
    message: d.message,
    error: d.error,
  });
});

app.get('/api/budget', (req, res) => {
  const nextReset = new Date();
  nextReset.setHours(24, 0, 0, 0);
  res.json({
    limit: DOWNLOAD_BUDGET_BYTES,
    used: budgetUsed(),
    remaining: budgetRemaining(),
    date: budgetState.date,
    resetsAt: nextReset.toISOString(),
    limitGb: DOWNLOAD_BUDGET_GB,
  });
});

app.get('/api/downloads/:id/file', (req, res) => {
  const d = downloads.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'download not found' });
  if (d.status !== 'complete') return res.status(409).json({ error: 'download not complete' });
  if (!fs.existsSync(d.outFile)) return res.status(404).json({ error: 'file missing' });
  const name = path.basename(d.outFile);
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.set('Content-Type', d.outFile.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4');
  res.sendFile(d.outFile, { dotfiles: 'deny' }, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'send failed' });
  });
});

app.delete('/api/downloads/:id', (req, res) => {
  const d = downloads.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'download not found' });
  d.status = 'cancelled';
  d.message = 'Cancelled';
  downloads.delete(d.downloadId);
  const set = downloadsByStream.get(d.streamId);
  if (set) {
    set.delete(d.downloadId);
    if (!set.size) downloadsByStream.delete(d.streamId);
  }
  const s = streams.get(d.streamId);
  if (s) s.downloading = false;
  fs.promises.rm(path.dirname(d.outFile), { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

/* ─── Media library API (persistent private folder) ────────────────────────── */

function safeMediaId(input) {
  const clean = String(input || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return clean || `media_${Date.now().toString(36)}`;
}

function mediaDirFor(id) {
  return path.join(MEDIA_DIR, safeMediaId(id));
}

function ensureMediaDir() {
  return fs.promises.mkdir(MEDIA_DIR, { recursive: true });
}

function mediaMime(filePath) {
  return filePath.toLowerCase().endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4';
}

// Move a finished tracked download into the persistent media library, storing
// its metadata alongside so the offline experience can be richer.
app.post('/api/media', async (req, res) => {
  try {
    const { downloadId, meta } = req.body || {};
    const d = downloadId && downloads.get(downloadId);
    if (!d || d.status !== 'complete') {
      return res.status(409).json({ error: 'download not complete or not found' });
    }
    if (!d.outFile || !fs.existsSync(d.outFile)) {
      return res.status(404).json({ error: 'file missing' });
    }

    const id = safeMediaId((meta && (meta.id || meta.serverId)) || d.downloadId);
    await ensureMediaDir();
    const destDir = mediaDirFor(id);
    await fs.promises.mkdir(destDir, { recursive: true });

    const fileName = path.basename(d.outFile);
    const destFile = path.join(destDir, fileName);
    if (!fs.existsSync(destFile)) {
      await fs.promises.copyFile(d.outFile, destFile);
    }
    const stat = await fs.promises.stat(destFile);

    // The file is complete, so probing gives the exact runtime. This is what
    // lets the offline player show the full duration for remuxed (fragmented
    // MP4) playback where the browser only learns the total progressively.
    const probed = await probeCodecs(destFile).catch(() => null);

    const record = {
      id,
      fileName,
      fileSize: stat.size,
      mimeType: mediaMime(destFile),
      duration: probed ? probed.duration : 0,
      downloadDate: new Date().toISOString(),
      meta: meta || {},
    };
    await fs.promises.writeFile(path.join(destDir, 'meta.json'), JSON.stringify(record, null, 2));

    // Free the temp download now that the file lives in the library.
    downloads.delete(d.downloadId);
    fs.promises.rm(path.dirname(d.outFile), { recursive: true, force: true }).catch(() => {});

    return res.json({
      id,
      streamUrl: `/api/media/${id}/stream`,
      fileSize: record.fileSize,
      duration: record.duration,
      downloadDate: record.downloadDate,
    });
  } catch (err) {
    console.error('[media] save failed:', err.message);
    res.status(500).json({ error: 'save failed' });
  }
});

app.get('/api/media', async (req, res) => {
  try {
    await ensureMediaDir();
    const entries = await fs.promises.readdir(MEDIA_DIR, { withFileTypes: true });
    const items = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const metaPath = path.join(MEDIA_DIR, e.name, 'meta.json');
      try {
        const raw = await fs.promises.readFile(metaPath, 'utf8');
        items.push(JSON.parse(raw));
      } catch {}
    }
    items.sort((a, b) => String(b.downloadDate || '').localeCompare(String(a.downloadDate || '')));
    res.json({ items });
  } catch {
    res.status(500).json({ error: 'list failed' });
  }
});

app.get('/api/media/:id/meta', async (req, res) => {
  try {
    const dir = mediaDirFor(req.params.id);
    const metaPath = path.join(dir, 'meta.json');
    const record = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
    // Items saved before the duration probe existed: fill it lazily (and cache)
    // so the player can still show the full runtime.
    if (!record.duration) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const fileEntry = entries.find((f) => f.isFile() && f.name !== 'meta.json');
      if (fileEntry) {
        const probed = await probeCodecs(path.join(dir, fileEntry.name)).catch(() => null);
        if (probed && probed.duration > 0) {
          record.duration = probed.duration;
          await fs.promises.writeFile(metaPath, JSON.stringify(record, null, 2));
        }
      }
    }
    res.json(record);
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

app.get('/api/media/:id/stream', async (req, res) => {
  try {
    const dir = mediaDirFor(req.params.id);
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const fileEntry = entries.find((f) => f.isFile() && f.name !== 'meta.json');
    if (!fileEntry) return res.status(404).json({ error: 'file missing' });
    const filePath = path.join(dir, fileEntry.name);
    const stat = await fs.promises.stat(filePath);
    const mime = mediaMime(filePath);
    const lowerName = fileEntry.name.toLowerCase();
    const startTime = Math.max(0, parseFloat(req.query.startTime) || 0);

    // Downloaded files are often MKV (or carry DTS/EAC3 audio) which Chromium
    // can't play. Remux them to fragmented MP4 on the fly, exactly like the
    // online streaming path, so offline playback works and the source duration
    // is advertised via X-Media-Duration.
    const needsRemux = lowerName.endsWith('.mkv') || lowerName.endsWith('.avi') || lowerName.endsWith('.webm');
    if (needsRemux || lowerName.endsWith('.mp4')) {
      if (ffmpegUsable === null) await ensureFfmpegUsable();
      if (ffmpegUsable) {
        const cfg = await probeCodecs(filePath).catch(() => null);
        if (cfg) {
          const unsafeAudio = cfg.hasAudio && !['aac', 'mp3', 'opus', 'vorbis'].includes(cfg.audioCodec);
          if (needsRemux || unsafeAudio || startTime > 0) {
            const handled = await spawnFileRemux(res, filePath, startTime, cfg, fileEntry.name)
              .catch(() => false);
            if (handled) return;
          }
        }
      }
    }

    const headers = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    };
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
        ...headers,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        ...headers,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.status(404).json({ error: 'not found' });
  }
});

app.delete('/api/media/:id', async (req, res) => {
  try {
    await fs.promises.rm(mediaDirFor(req.params.id), { recursive: true, force: true });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'delete failed' });
  }
});

app.get('/api/stream/:id/status', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'stream not found' });

  const { torrent } = s;
  const ready = torrent.done || torrent.progress > 0.005 || torrent.downloaded > 2 * 1024 * 1024;
  res.json({
    downloaded: torrent.downloaded,
    total: torrent.length,
    progress: torrent.progress,
    speed: torrent.downloadSpeed,
    peers: torrent.numPeers,
    ready,
    duration: s.duration || 0,
  });
});

app.delete('/api/stream/:id', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'stream not found' });
  if (s.ffmpegProc) {
    try { s.ffmpegProc.kill('SIGKILL'); } catch {}
    s.ffmpegProc = null;
  }
  const isDownloading = downloadsByStream.has(req.params.id);
  if (isDownloading) {
    s.pendingDestroy = true;
  } else {
    let shared = false;
    for (const [otherId, otherS] of streams.entries()) {
      if (otherId !== req.params.id && otherS.torrent === s.torrent) {
        shared = true;
        break;
      }
    }
    if (!shared && s.torrent) {
      try { s.torrent.destroy(); } catch {}
    }
  }
  streams.delete(req.params.id);
  res.json({ ok: true });
});

app.get('/api/servers', (req, res) => {
  res.json({ servers: [] });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', streams: streams.size });
});

/* ─── TMDB Live Catalog & Image Proxy ─────────────────────────────────────── */
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'acc5f02e54fa612710d3245f53f29600';
let cachedCatalog = null;
let lastCatalogFetch = 0;

app.get('/api/catalog', async (req, res) => {
  if (cachedCatalog && Date.now() - lastCatalogFetch < 1800000) {
    return res.json(cachedCatalog);
  }
  try {
    const [trendRes, topRes, tvRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${TMDB_API_KEY}`)
    ]);
    const trendJson = await trendRes.json();
    const topJson = await topRes.json();
    const tvJson = await tvRes.json();

    const formatItems = (list, isTv = false) => (list || []).slice(0, 10).map(item => ({
      id: item.id,
      title: item.title || item.name || 'Unknown',
      year: (item.release_date || item.first_air_date || '2024').slice(0, 4),
      rating: (item.vote_average || 8.0).toFixed(1),
      overview: item.overview || '',
      posterPath: item.poster_path || '',
      backdropPath: item.backdrop_path || '',
      isTv
    }));

    cachedCatalog = {
      categories: [
        { name: 'TRENDING MOVIES', items: formatItems(trendJson.results) },
        { name: 'TOP RATED MASTERPIECES', items: formatItems(topJson.results) },
        { name: 'POPULAR TV SHOWS', items: formatItems(tvJson.results, true) }
      ]
    };
    lastCatalogFetch = Date.now();
    res.json(cachedCatalog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/image', async (req, res) => {
  const p = req.query.path;
  const size = req.query.size || 'w500';
  if (!p || typeof p !== 'string' || !p.startsWith('/') || p.includes('..') || !/^(w\d+|original)$/.test(size)) {
    return res.status(400).end();
  }
  try {
    const tmdbUrl = `https://image.tmdb.org/t/p/${size}${p}`;
    const imgRes = await fetch(tmdbUrl);
    if (!imgRes.ok) return res.status(imgRes.status).end();
    res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const arrayBuffer = await imgRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(502).end();
  }
});

/* ─── Series torrent search (TPB proxy) ───────────────────────────────────── */
const SEARCH_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'https://tracker.btorrent.xyz',
];

function seriesEpiTag(season, episode) {
  return `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`;
}

async function apibaySearch(query) {
  try {
    const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': SUBTITLE_UA },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const list = await res.json();
      if (
        Array.isArray(list)
        && list.length
        && list[0].info_hash
        && list[0].info_hash !== '0000000000000000000000000000000000000000'
      ) {
        return list;
      }
      return [];
    }
  } catch (err) {
    try {
      const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
      const { stdout } = await execFileAsync(
        'curl',
        ['-s', '-m', '5', '-A', SUBTITLE_UA, url],
        { timeout: 6000 }
      );
      const list = JSON.parse(stdout);
      if (
        Array.isArray(list)
        && list.length
        && list[0].info_hash
        && list[0].info_hash !== '0000000000000000000000000000000000000000'
      ) {
        return list;
      }
    } catch {}
  }
  return [];
}

function qualityFromName(name) {
  const n = name.toLowerCase();
  if (n.includes('2160p') || n.includes('4k')) return '2160p';
  if (n.includes('1080p')) return '1080p';
  if (n.includes('720p')) return '720p';
  if (n.includes('480p')) return '480p';
  if (n.includes('xvid') || n.includes('divx')) return 'SD';
  return 'HD';
}

function magnetFromHash(hash, name) {
  const tr = SEARCH_TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
  return `magnet:?xt=urn:btih:${hash.toLowerCase()}&dn=${encodeURIComponent(name)}&${tr}`;
}

const TITLE_STOPWORDS = new Set(['the', 'a', 'an', 'and', 'of', 'for', 'with', 'in', 'on', 'at', 'to', 'de', 'el', 'la', 'los', 'las', 'e', 'y']);

function titleTokens(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(w => w && !TITLE_STOPWORDS.has(w));
}

function showNameMatches(title, name, tag) {
  const tokens = titleTokens(title);
  if (!tokens.length) return true;
  const lower = name.toLowerCase();
  const tagPos = lower.indexOf(tag);
  const before = titleTokens(tagPos >= 0 ? lower.slice(0, tagPos) : lower);
  let from = 0;
  for (const token of tokens) {
    const i = before.indexOf(token, from);
    if (i === -1) return false;
    from = i + 1;
  }
  return true;
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

const searchCache = new BoundedMap(500);

async function tmdbMediaInfo(tmdbId, isMovie = true, fallbackMeta = {}) {
  const type = isMovie ? 'movie' : 'tv';
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`tmdb lookup failed (${res.status})`);
    const d = await res.json();
    let imdbId = d.imdb_id || '';
    if (!imdbId) {
      try {
        const extRes = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`, { signal: AbortSignal.timeout(3000) });
        if (extRes.ok) {
          const ext = await extRes.json();
          imdbId = ext.imdb_id || '';
        }
      } catch {}
    }
    const year = (d.release_date || d.first_air_date || '').slice(0, 4);
    return {
      title: d.title || d.name || d.original_title || d.original_name || fallbackMeta.title || '',
      imdbId: (imdbId || fallbackMeta.imdbId || '').replace(/^tt/, ''),
      year: year || fallbackMeta.year || '',
    };
  } catch (err) {
    if (fallbackMeta.title) {
      return {
        title: fallbackMeta.title,
        imdbId: (fallbackMeta.imdbId || '').replace(/^tt/, ''),
        year: fallbackMeta.year || '',
      };
    }
    throw err;
  }
}

async function fetchTorrentioSources(imdbId, season = null, episode = null) {
  if (!imdbId) return [];
  const cleanImdb = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
  const pathPart = (season != null && episode != null)
    ? `series/${cleanImdb}:${season}:${episode}.json`
    : `movie/${cleanImdb}.json`;
  const url = `https://torrentio.strem.fun/stream/${pathPart}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': SUBTITLE_UA }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    const streams = data.streams || [];
    return streams.filter(s => s.infoHash).map(s => {
      const seedMatch = s.title?.match(/👤\s*(\d+)/);
      const seeds = seedMatch ? parseInt(seedMatch[1], 10) : 10;
      const sizeMatch = s.title?.match(/💾\s*([0-9.]+\s*(?:GB|MB|TB))/i);
      const size = sizeMatch ? sizeMatch[1] : '';
      const quality = s.name?.replace('Torrentio\n', '').trim() || qualityFromName(s.title || '');
      return {
        quality,
        magnet: magnetFromHash(s.infoHash, s.title?.split('\n')[0] || 'stream'),
        size,
        seeds,
      };
    });
  } catch (err) {
    console.warn(`[search] torrentio failed: ${err.message}`);
    return [];
  }
}

async function fetchYtsMovieSources(imdbId, title = '') {
  const domains = ['yts.gg', 'yts.rs', 'yts.do', 'yts.ag'];
  const numId = imdbId ? imdbId.replace('tt', '') : null;
  const urls = [];
  for (const d of domains) {
    if (numId) urls.push(`https://${d}/api/v2/movie_details.json?imdb_id=${numId}`);
    if (title) urls.push(`https://${d}/api/v2/list_movies.json?query_term=${encodeURIComponent(title)}&limit=5`);
  }

  const fetchUrl = async (url) => {
    const res = await fetch(url, { headers: { 'User-Agent': SUBTITLE_UA }, signal: AbortSignal.timeout(3500) });
    if (!res.ok) return [];
    const data = await res.json();
    const movie = data?.data?.movie || data?.data?.movies?.[0];
    const torrents = movie?.torrents;
    if (!torrents || !torrents.length) return [];
    const movieTitle = movie.title || title || 'Movie';
    return torrents.filter(t => t.hash).map(t => ({
      quality: `${t.quality} ${t.type || ''}`.trim(),
      magnet: magnetFromHash(t.hash, `${movieTitle} ${t.quality}`),
      size: t.size || '',
      seeds: Number(t.seeds || 10),
    }));
  };

  try {
    const results = await Promise.any(urls.map(u => fetchUrl(u).then(r => r.length ? r : Promise.reject())));
    if (results && results.length) return results;
  } catch {}
  return [];
}

async function solidTorrentsSearch(query) {
  try {
    const url = `https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(query)}&category=video`;
    const res = await fetch(url, { headers: { 'User-Agent': SUBTITLE_UA }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    const list = data.results || [];
    return list.filter(r => r.infohash && r.title).map(r => ({
      quality: qualityFromName(r.title),
      magnet: magnetFromHash(r.infohash, r.title),
      size: formatSize(Number(r.size) || 0),
      seeds: Number(r.seeders || 0),
    }));
  } catch (err) {
    console.warn(`[search] solidtorrents error: ${err.message}`);
    return [];
  }
}

async function bitSearchSources(title, season = null, episode = null, year = '') {
  const isTv = season != null && episode != null;
  const tag = isTv ? seriesEpiTag(season, episode) : '';
  const query = isTv ? `${title} ${tag}` : (year ? `${title} ${year} 1080p` : `${title} 1080p`);
  const out = [];
  const url = `https://bitsearch.to/search?q=${encodeURIComponent(query)}`;
  let stdout = '';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SUBTITLE_UA },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      stdout = await res.text();
    }
  } catch {
    try {
      const res = await execFileAsync(
        'curl',
        ['-s', '-L', '-m', '5', '-A', SUBTITLE_UA, url],
        { timeout: 6000 }
      );
      stdout = res.stdout;
    } catch {}
  }
  if (!stdout) return out;
  try {
    const doc = stdout;
    const seen = new Set();
    for (const m of doc.matchAll(/href="(magnet:[^"]+)"/g)) {
      const magnet = m[1].replace(/&#x3D;/g, '=').replace(/&amp;/g, '&');
      const hash = (magnet.match(/btih:([a-f0-9]{40})/i) || [])[1];
      if (!hash) continue;
      const key = hash.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const start = m.index;
      const before = doc.slice(Math.max(0, start - 6000), start);
      const titleMatch = [...before.matchAll(/<h3[^>]*>\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/g)];
      const name = titleMatch.length ? titleMatch[titleMatch.length - 1][1].trim() : '';
      const sizeMatch = [...before.matchAll(/<span>([0-9.]+\s*(?:MB|GB|TB))<\/span>/g)];
      const size = sizeMatch.length ? sizeMatch[sizeMatch.length - 1][1] : '';
      const seedMatch = [...before.matchAll(/<span class="font-medium">(\d+)<\/span>\s*<span>seeders<\/span>/g)];
      const seeds = seedMatch.length ? Number(seedMatch[seedMatch.length - 1][1]) : 0;

      if (!name) continue;
      if (isTv && (!name.toLowerCase().includes(tag) || !showNameMatches(title, name, tag))) continue;
      out.push({
        quality: qualityFromName(name),
        magnet,
        size,
        seeds,
      });
    }
  } catch (err) {
    console.warn(`[search] bitsearch failed: ${err.message}`);
  }
  return out;
}

app.get('/api/search', async (req, res) => {
  const tmdbId = Number(req.query.tmdbId);
  const season = req.query.season != null && !isNaN(Number(req.query.season)) ? Number(req.query.season) : null;
  const episode = req.query.episode != null && !isNaN(Number(req.query.episode)) ? Number(req.query.episode) : null;
  const isMovie = season == null || episode == null;
  const clientTitle = req.query.title ? String(req.query.title).trim() : '';
  const clientYear = req.query.year ? String(req.query.year).trim() : '';
  const clientImdb = req.query.imdbId ? String(req.query.imdbId).trim() : '';

  if (!tmdbId && !clientTitle) {
    return res.status(400).json({ error: 'tmdbId or title required' });
  }

  const cacheKey = `${tmdbId || clientTitle}:${season || ''}:${episode || ''}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 3600000 && cached.sources.length) {
    return res.json({ title: cached.title, season, episode, isMovie, sources: cached.sources, cached: true });
  }

  try {
    const meta = await tmdbMediaInfo(tmdbId, isMovie, { title: clientTitle, year: clientYear, imdbId: clientImdb }).catch(() => ({
      title: clientTitle,
      imdbId: clientImdb.replace(/^tt/, ''),
      year: clientYear,
    }));

    const title = meta.title || clientTitle || 'Video';
    const imdbId = meta.imdbId || clientImdb.replace(/^tt/, '');
    const year = meta.year || clientYear;

    console.log(`[search] ${isMovie ? 'Movie' : 'Series'}: ${title} (IMDb: ${imdbId || 'none'}, Year: ${year || 'none'})`);

    const requests = [];

    if (isMovie) {
      // 1. Torrentio stream aggregator (TPB, 1337x, TGx, YTS, EZTV)
      if (imdbId) requests.push(fetchTorrentioSources(imdbId));
      // 2. YTS direct mirrors (by IMDb and by Title)
      requests.push(fetchYtsMovieSources(imdbId, title));
      // 3. PirateBay search (with year, and fallback without year)
      const movieQuery = year ? `${title} ${year}` : title;
      requests.push(apibaySearch(movieQuery).then(async list => {
        if (!Array.isArray(list) || !list.length) {
          list = await apibaySearch(title);
        }
        if (!Array.isArray(list)) return [];
        return list.filter(t => t.info_hash && t.name).map(t => ({
          title: t.name,
          quality: qualityFromName(t.name),
          magnet: magnetFromHash(t.info_hash, t.name),
          size: formatSize(Number(t.size) || 0),
          seeds: Number(t.seeders || 0),
        }));
      }));
      // 4. SolidTorrents video search
      requests.push(solidTorrentsSearch(movieQuery));
      // 5. BitSearch
      requests.push(bitSearchSources(title, null, null, year));
    } else {
      // Series
      const tag = seriesEpiTag(season, episode);
      if (imdbId) requests.push(fetchTorrentioSources(imdbId, season, episode));
      requests.push(apibaySearch(`${title} ${tag}`).then(async list => {
        if (!Array.isArray(list) || !list.length) {
          list = await apibaySearch(title);
        }
        if (!Array.isArray(list)) return [];
        let filtered = list.filter(t =>
          t.info_hash && t.name && t.name.toLowerCase().includes(tag) && showNameMatches(title, t.name, tag)
        );
        // Fallback: If no individual episode torrents, include season packs for that season
        if (!filtered.length) {
          const sTag = `s${String(season).padStart(2, '0')}`;
          filtered = list.filter(t =>
            t.info_hash && t.name &&
            (new RegExp(`\\b${sTag}\\b`, 'i').test(t.name) || new RegExp(`\\bseason[ ._-]*0*${season}\\b`, 'i').test(t.name)) &&
            showNameMatches(title, t.name, sTag)
          );
        }
        const seeded = filtered.filter(t => Number(t.seeders || 0) > 0);
        return (seeded.length ? seeded : filtered).map(t => ({
          title: t.name,
          quality: qualityFromName(t.name),
          magnet: magnetFromHash(t.info_hash, t.name),
          size: formatSize(Number(t.size) || 0),
          seeds: Number(t.seeders || 0),
        }));
      }));
      requests.push(solidTorrentsSearch(`${title} ${tag}`));
      requests.push(bitSearchSources(title, season, episode));
    }

    const settled = await Promise.allSettled(requests);
    const merged = new Map();

    for (const result of settled) {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value)) continue;
      for (const s of result.value) {
        if (!s || !s.magnet) continue;
        const m = (s.magnet || '').match(/btih:([a-f0-9]{40})/i);
        const key = m ? m[1].toLowerCase() : s.magnet;
        const prev = merged.get(key);
        if (!prev || (s.seeds || 0) > (prev.seeds || 0)) {
          merged.set(key, s);
        }
      }
    }

    const sources = [...merged.values()]
      .sort((a, b) => (b.seeds || 0) - (a.seeds || 0))
      .slice(0, 10);

    console.log(`[search] Returning ${sources.length} sources for ${title}`);
    searchCache.set(cacheKey, { title, sources, timestamp: Date.now() });
    res.json({ title, season, episode, isMovie, sources });
  } catch (err) {
    console.error('[search] error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

const subtitleCache = new BoundedMap(500);
const subtitleTracksCache = new BoundedMap(500);
const subtitleAlts = new BoundedMap(1000);

const SUBTITLE_LANG_NAMES = {
  ar: 'Arabic', en: 'English', fr: 'French', es: 'Spanish', de: 'German',
  pt: 'Portuguese', ru: 'Russian', tr: 'Turkish', hi: 'Hindi', ur: 'Urdu',
  it: 'Italian', nl: 'Dutch', ja: 'Japanese', zh: 'Chinese', ko: 'Korean',
  pl: 'Polish', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish',
  cs: 'Czech', el: 'Greek', he: 'Hebrew', id: 'Indonesian', ms: 'Malay',
  th: 'Thai', vi: 'Vietnamese', uk: 'Ukrainian', hu: 'Hungarian', ro: 'Romanian',
  bg: 'Bulgarian', sr: 'Serbian', hr: 'Croatian', fa: 'Persian', bn: 'Bengali',
};

const YIFY_LANG_MAP = {
  english: 'en', arabic: 'ar', french: 'fr', spanish: 'es', 'brazilian-portuguese': 'pt-BR',
  'brazillian-portuguese': 'pt-BR', portuguese: 'pt', german: 'de', italian: 'it', dutch: 'nl',
  swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi', polish: 'pl', czech: 'cs',
  slovak: 'sk', hungarian: 'hu', romanian: 'ro', bulgarian: 'bg', greek: 'el', russian: 'ru',
  ukrainian: 'uk', turkish: 'tr', hebrew: 'he', hindi: 'hi', bengali: 'bn', tamil: 'ta',
  telugu: 'te', urdu: 'ur', indonesian: 'id', malay: 'ms', thai: 'th', vietnamese: 'vi',
  'chinese-simplified': 'zh', 'chinese-traditional': 'zh-TW', chinese: 'zh', japanese: 'ja',
  korean: 'ko', persian: 'fa', farsi: 'fa', croatian: 'hr', serbian: 'sr', slovenian: 'sl',
  bosnian: 'bs', macedonian: 'mk', albanian: 'sq', latvian: 'lv', lithuanian: 'lt',
  estonian: 'et', georgian: 'ka', armenian: 'hy', azerbaijani: 'az', catalan: 'ca',
  basque: 'eu', galician: 'gl', welsh: 'cy', icelandic: 'is', maltese: 'mt', tagalog: 'tl',
  afrikaans: 'af', swahili: 'sw', zulu: 'zu', mongolian: 'mn', kazakh: 'kk', uzbek: 'uz',
  nepali: 'ne', sinhala: 'si', khmer: 'km', latin: 'la', malayalam: 'ml',
};

function extractSrtFromZip(buf) {
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      const method = buf.readUInt16LE(offset + 8);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
      const dataStart = offset + 30 + nameLen + extraLen;
      const cdIndex = buf.indexOf(Buffer.from('PK\x01\x02'), dataStart);
      const dataEnd = cdIndex === -1 ? buf.length : cdIndex;
      if (/\.srt$/i.test(name)) {
        const data = buf.slice(dataStart, dataEnd);
        if (method === 0) return data;
        if (method === 8) return zlib.inflateRawSync(data);
      }
      offset = dataEnd;
    } else {
      offset++;
    }
  }
  return null;
}

async function fetchYifyTracks(imdbId) {
  let res = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(`${YIFY_SUBS}/movie-imdb/${imdbId}`, {
        headers: { 'User-Agent': SUBTITLE_UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) break;
    } catch {
      res = null;
    }
    await new Promise(r => setTimeout(r, 600 * attempt));
  }
  if (!res || !res.ok) return [];
  const html = await res.text();
  const tracks = [];
  const seen = new Set();
  const re = /href="\/subtitles\/([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    const parts = slug.match(/^.*-\d{4}-([a-z-]+)-yify-(\d+)$/i);
    if (!parts) continue;
    const langSlug = parts[1].toLowerCase().replace(/-(hi|sdh)$/, '');
    const lang = YIFY_LANG_MAP[langSlug] || langSlug;
    if (seen.has(lang)) continue;
    seen.add(lang);
    tracks.push({
      lang,
      langName: SUBTITLE_LANG_NAMES[lang] || langSlug.replace(/-/g, ' '),
      fileId: `yify:${slug}`,
    });
  }
  return tracks;
}

function sanitizeSubtitleText(text) {
  return text
    .replace(/^(?:STYLE|NOTE|REGION)\b[\s\S]*?^\s*$/gm, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/<font[^>]*>/gi, '')
    .replace(/<\/font>/gi, '')
    .replace(/<c(?:\.[a-z0-9_-]+)*>/gi, '')
    .replace(/<\/c>/gi, '')
    .replace(/<v[^>]*>[\s\S]*?<\/v>/gi, '')
    .replace(/style="[^"]*"/gi, '')
    .replace(/color="[^"]*"/gi, '');
}

// Strict UTF-8 validator. Many Arabic/SRT files are actually Windows-1256 or
// ISO-8859-6; decoding those as UTF-8 produces mojibake ("garbage signs").
function isValidUtf8(buf) {
  let i = 0;
  const n = buf.length;
  while (i < n) {
    const b = buf[i];
    if (b < 0x80) { i++; continue; }
    if (b >= 0xc2 && b <= 0xdf) {
      if (i + 1 >= n || (buf[i + 1] & 0xc0) !== 0x80) return false;
      i += 2;
    } else if (b === 0xe0) {
      if (i + 2 >= n || buf[i + 1] < 0xa0 || buf[i + 1] > 0xbf || (buf[i + 2] & 0xc0) !== 0x80) return false;
      i += 3;
    } else if ((b >= 0xe1 && b <= 0xec) || (b >= 0xee && b <= 0xef)) {
      if (i + 2 >= n || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i + 2] & 0xc0) !== 0x80) return false;
      i += 3;
    } else if (b === 0xed) {
      if (i + 2 >= n || buf[i + 1] < 0x80 || buf[i + 1] > 0x9f || (buf[i + 2] & 0xc0) !== 0x80) return false;
      i += 3;
    } else if (b === 0xef) {
      if (i + 2 >= n || buf[i + 1] < 0x80 || buf[i + 1] > 0xbf || (buf[i + 2] & 0xc0) !== 0x80) return false;
      i += 3;
    } else if (b >= 0xf0 && b <= 0xf4) {
      if (i + 3 >= n) return false;
      const b1 = buf[i + 1];
      if ((b === 0xf0 && (b1 < 0x90 || b1 > 0xbf)) || (b === 0xf4 && (b1 < 0x80 || b1 > 0x8f)) || (b1 & 0xc0) !== 0x80) return false;
      if ((buf[i + 2] & 0xc0) !== 0x80 || (buf[i + 3] & 0xc0) !== 0x80) return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

function hasArabic(text) {
  return /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

// Decode a subtitle buffer into text, auto-detecting legacy encodings.
function decodeSubtitleText(buf) {
  if (!buf || !buf.length) return '';
  let b = buf;
  if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.slice(3); // UTF-8 BOM
  else if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) {
    try { return new TextDecoder('utf-16le').decode(b.slice(2)); } catch {}
  } else if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) {
    try { return new TextDecoder('utf-16be').decode(b.slice(2)); } catch {}
  }

  if (isValidUtf8(b)) return b.toString('utf8');

  // Not valid UTF-8 — try legacy encodings, preferring ones that yield Arabic.
  for (const enc of ['windows-1256', 'iso-8859-6', 'windows-1252', 'latin1']) {
    try {
      const text = new TextDecoder(enc).decode(b);
      if (hasArabic(text)) return text;
    } catch {}
  }
  try {
    return new TextDecoder('windows-1256').decode(b);
  } catch {
    return b.toString('utf8');
  }
}

function sendSubtitle(res, buf) {
  let text = decodeSubtitleText(buf);
  if (!/^\s*WEBVTT/i.test(text)) {
    text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    text = 'WEBVTT\n\n' + text;
  }
  text = sanitizeSubtitleText(text);
  res.set('Content-Type', 'text/vtt; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  res.send(text);
}

async function searchSubdl(tmdbId, season, episode) {
  const isTv = season != null && episode != null;
  const params = new URLSearchParams();
  params.set('api_key', subdlApiKey);
  params.set('tmdb_id', String(tmdbId));
  params.set('type', isTv ? 'tv' : 'movie');
  params.set('subs_per_page', '100');
  params.set('unpack', '1');
  if (isTv) {
    params.set('season_number', String(season));
    params.set('episode_number', String(episode));
  }

  const resp = await fetch(`${SUBDL_API}?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': SUBTITLE_UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    console.error('[subs] search failed:', resp.status, detail.slice(0, 200));
    return [];
  }
  const json = await resp.json();
  if (!json.status || !Array.isArray(json.subtitles)) return [];

  const byLang = new Map();
  for (const sub of json.subtitles) {
    const files = (sub.unpack_files && sub.unpack_files.length)
      ? sub.unpack_files
      : (sub.url ? [{
          file_n_id: sub.sd_id != null ? String(sub.sd_id) : (sub.n_id || ''),
          url: sub.url,
          language: sub.language,
        }] : []);
    for (const f of files) {
      if (isTv) {
        const fs = f.season != null ? Number(f.season) : null;
        const fe = f.episode != null ? Number(f.episode) : null;
        if (fs != null && fe != null) {
          const exact = fs === season && fe === episode;
          if (!exact) continue;
        }
      }
      const fileId = f.file_n_id ? String(f.file_n_id) : '';
      const dlUrl = f.url ? `${SUBDL_DL}${f.url}` : '';
      if (!fileId || !dlUrl) continue;
      const lang = String(f.language || 'EN').toLowerCase();
      subtitleCache.set(fileId, { url: dlUrl, buf: null });
      if (!byLang.has(lang)) {
        byLang.set(lang, { lang, langName: SUBTITLE_LANG_NAMES[lang] || lang.toUpperCase(), fileId });
      }
    }
  }
  return [...byLang.values()];
}

const TVS_LANG_CODES = {
  english: 'en', arabic: 'ar', french: 'fr', spanish: 'es', german: 'de',
  portuguese: 'pt', 'brazilian portuguese': 'pt-BR', 'brazillian portuguese': 'pt-BR',
  russian: 'ru', turkish: 'tr', hindi: 'hi', urdu: 'ur', italian: 'it',
  dutch: 'nl', japanese: 'ja', chinese: 'zh', korean: 'ko', polish: 'pl',
  swedish: 'sv', danish: 'da', norwegian: 'no', finnish: 'fi', czech: 'cs',
  greek: 'el', hebrew: 'he', indonesian: 'id', malay: 'ms', thai: 'th',
  vietnamese: 'vi', ukrainian: 'uk', hungarian: 'hu', romanian: 'ro',
  bulgarian: 'bg', serbian: 'sr', croatian: 'hr', persian: 'fa', bengali: 'bn',
  catalan: 'ca', slovak: 'sk', slovenian: 'sl', bosnian: 'bs', macedonian: 'mk',
  albanian: 'sq', latvian: 'lv', lithuanian: 'lt', estonian: 'et', georgian: 'ka',
  armenian: 'hy', azerbaijani: 'az', basque: 'eu', galician: 'gl', welsh: 'cy',
  icelandic: 'is', maltese: 'mt', tagalog: 'tl', afrikaans: 'af', swahili: 'sw',
  'farsi': 'fa',
  'английские': 'en', 'английский': 'en',
  'французские': 'fr', 'французский': 'fr',
  'испанские': 'es', 'испанский': 'es',
  'немецкие': 'de', 'немецкий': 'de',
  'итальянские': 'it', 'итальянский': 'it',
  'португальские': 'pt', 'португальский': 'pt',
  'русские': 'ru', 'русский': 'ru',
  'турецкие': 'tr', 'турецкий': 'tr',
  'украинские': 'uk', 'украинский': 'uk',
  'греческие': 'el', 'греческий': 'el',
  'венгерские': 'hu', 'венгерский': 'hu',
  'польские': 'pl', 'польский': 'pl',
  'румынские': 'ro', 'румынский': 'ro',
  'болгарские': 'bg', 'болгарский': 'bg',
  'сербские': 'sr', 'сербский': 'sr',
  'хорватские': 'hr', 'хорватский': 'hr',
  'чешские': 'cs', 'чешский': 'cs',
  'словацкие': 'sk', 'словацкий': 'sk',
  'словенские': 'sl', 'словенский': 'sl',
  'шведские': 'sv', 'шведский': 'sv',
  'датские': 'da', 'датский': 'da',
  'норвежские': 'no', 'норвежский': 'no',
  'финские': 'fi', 'финский': 'fi',
  'нидерландские': 'nl', 'нидерландский': 'nl',
  'арабские': 'ar', 'арабский': 'ar',
  'еврейские': 'he', 'иврит': 'he',
  'китайские': 'zh', 'китайский': 'zh',
  'японские': 'ja', 'японский': 'ja',
  'корейские': 'ko', 'корейский': 'ko',
  'хинди': 'hi', 'урду': 'ur',
  'персидские': 'fa', 'персидский': 'fa',
  'индонезийские': 'id', 'индонезийский': 'id',
  'тайские': 'th', 'тайский': 'th',
  'вьетнамские': 'vi', 'вьетнамский': 'vi',
  'бенгальские': 'bn', 'бенгальский': 'bn',
  'каталанские': 'ca', 'каталанский': 'ca',
  'албанские': 'sq', 'албанский': 'sq',
  'македонские': 'mk', 'македонский': 'mk',
  'грузинские': 'ka', 'грузинский': 'ka',
  'армянские': 'hy', 'армянский': 'hy',
  'азербайджанские': 'az', 'азербайджанский': 'az',
};

const TVS_HOST = 'https://www.tvsubtitles.net';

async function tvsGet(url) {
  const { stdout } = await execFileAsync(
    'curl',
    ['-s', '-L', '-m', '20', '-A', SUBTITLE_UA, '-H', 'Accept-Language: en-US,en;q=0.9', url],
    { timeout: 25000 }
  );
  return stdout;
}

async function tvsFindShow(title) {
  const html = await tvsGet(`${TVS_HOST}/search1.php?qs=${encodeURIComponent(title)}`);
  const results = [];
  const re = /<a href="\/tvshow-(\d+)\.html"[^>]*>([^<]*)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[2].trim();
    if (!name) continue;
    results.push({ id: m[1], name });
  }
  if (!results.length) return null;
  const tokens = titleTokens(title);
  let best = results[0];
  if (tokens.length) {
    let bestScore = -1;
    for (const r of results) {
      const clean = r.name.replace(/\(\d{4}(-\d{4})?\)/g, '').toLowerCase();
      let from = 0, ok = true;
      for (const t of tokens) {
        const i = clean.indexOf(t, from);
        if (i === -1) { ok = false; break; }
        from = i + 1;
      }
      const score = ok ? tokens.length : 0;
      if (score > bestScore) { bestScore = score; best = r; }
    }
  }
  return best;
}

async function tvsEpisodeUrl(showId, season, episode) {
  const ep = String(episode).padStart(2, '0');
  const html = await tvsGet(`${TVS_HOST}/tvshow-${showId}-${season}.html`);
  const re = new RegExp(`<td>${season}x${ep}</td>\\s*<td[^>]*>\\s*<a href="(episode-\\d+\\.html)">`, 'i');
  const m = re.exec(html);
  return m ? m[1] : null;
}

async function tvsEpisodeTracks(episodeUrl) {
  const html = await tvsGet(`${TVS_HOST}/${episodeUrl}`);
  const tracks = [];
  const seen = new Set();
  const sections = html.split(/<span style="color:#666666"><b>/);
  for (let i = 1; i < sections.length; i++) {
    const lm = sections[i].match(/^([^<]+?)\s*subtitles\s*<\/b>/i);
    if (!lm) continue;
    const langName = lm[1].trim();
    const lang = TVS_LANG_CODES[langName.toLowerCase()] || langName.toLowerCase().replace(/\s+/g, '-');
    if (seen.has(lang)) continue;
    const link = sections[i].match(/<a href="\/subtitle-(\d+)\.html"/);
    if (!link) continue;
    seen.add(lang);
    tracks.push({
      lang,
      langName: SUBTITLE_LANG_NAMES[lang] || langName,
      fileId: `tvs:${link[1]}`,
    });
  }
  return tracks;
}

async function tvsSubtitleContent(sid) {
  const page = await tvsGet(`${TVS_HOST}/subtitle-${sid}.html`);
  const dlMatch = page.match(/href="(download-\d+\.html)"/);
  if (!dlMatch) return null;
  const dlPage = await tvsGet(`${TVS_HOST}/${dlMatch[1]}`);
  const vars = {};
  for (const vm of dlPage.matchAll(/var s(\d+)\s*=\s*'([^']*)'/g)) {
    vars[Number(vm[1])] = vm[2];
  }
  const loc = dlPage.match(/document\.location\s*=\s*([^;]+);/);
  if (!loc) return null;
  let path = '';
  for (const tm of loc[1].matchAll(/s(\d+)/g)) {
    if (vars[Number(tm[1])] != null) path += vars[Number(tm[1])];
  }
  if (!path) return null;
  const fileUrl = /^https?:\/\//.test(path)
    ? path
    : `${TVS_HOST}/${path.replace(/^\//, '')}`;
  let res = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(encodeURI(fileUrl), {
        headers: { 'User-Agent': SUBTITLE_UA, Accept: '*/*' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) break;
    } catch (err) {
      res = null;
    }
    await new Promise(r => setTimeout(r, 700 * attempt));
  }
  if (!res || !res.ok) return null;
  const zip = Buffer.from(await res.arrayBuffer());
  let srt = extractSrtFromZip(zip);
  if (srt == null) {
    const asText = zip.toString('utf8');
    if (/^\s*\d{2}:\d{2}:\d{2}/m.test(asText)) srt = asText;
  }
  return srt;
}

async function fetchTvSubtitles(title, season, episode) {
  try {
    const show = await tvsFindShow(title);
    if (!show) return [];
    const epUrl = await tvsEpisodeUrl(show.id, season, episode);
    if (!epUrl) return [];
    const tracks = await tvsEpisodeTracks(epUrl);
    console.log(`[subs] tvsubtitles ${title} S${season}E${episode} (show ${show.name}) -> ${tracks.length} languages`);
    return tracks;
  } catch (err) {
    console.warn(`[subs] tvsubtitles failed: ${err.message.slice(0, 120)}`);
    return [];
  }
}

async function tmdbTitleFor(tmdbId, isMovie) {
  const url = `https://api.themoviedb.org/3/${isMovie ? 'movie' : 'tv'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tmdb lookup failed (${res.status})`);
  const d = await res.json();
  return d.title || d.name || d.original_title || d.original_name || '';
}

const SUBTITLE_CAT = 'https://subtitlecat.com';

const SCAT_LANG_MAP = {
  'pt-br': 'pt-BR', 'pt-pt': 'pt', 'es-419': 'es-419', 'es-es': 'es',
  'zh-cn': 'zh', 'zh-tw': 'zh-TW', 'en-us': 'en', 'en-gb': 'en',
  'sr-latn': 'sr', 'bs-latn': 'bs', 'zh-hans': 'zh', 'zh-hant': 'zh-TW',
};

function normalizeLangCode(code) {
  const c = String(code || '').toLowerCase().trim();
  if (!c) return null;
  if (SCAT_LANG_MAP[c]) return SCAT_LANG_MAP[c];
  return c;
}

function parseSubtitleCatRelease(html) {
  const out = [];
  const blocks = html.split(/class="sub-single"/);
  for (const b of blocks) {
    const flag = b.match(/<img[^>]*alt="([a-z0-9-]{2,7})"[^>]*class="flag"/i);
    const link = b.match(/href="(\/subs\/[^"]+\.srt)"/);
    if (!flag || !link) continue;
    out.push({ lang: flag[1], path: link[1] });
  }
  return out;
}

async function scatGet(url) {
  const { stdout } = await execFileAsync(
    'curl',
    ['-s', '-L', '-m', '20', '-A', SUBTITLE_UA, url],
    { timeout: 25000 }
  );
  return stdout;
}

async function fetchSubtitleCat(title, season, episode) {
  if (!title) return [];
  const isTv = season != null && episode != null;
  try {
    const html = await scatGet(`${SUBTITLE_CAT}/index.php?search=${encodeURIComponent(title)}`);
    const results = [];
    const re = /<a href="(subs\/\d+\/[^"]+\.html)">/g;
    let m;
    while ((m = re.exec(html)) !== null) results.push(m[1]);
    if (!results.length) return [];

    const tokens = titleTokens(title);
    const tag = isTv ? `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}` : null;
    const relevant = [];
    for (const href of results) {
      const slug = decodeURIComponent(href.replace(/^subs\/\d+\//, '').replace(/\.html$/i, ''));
      const lower = slug.toLowerCase();
      let ok = false;
      if (isTv) {
        const em = lower.match(/s(\d{1,2})[.\s_-]*e(\d{1,2})/) || lower.match(/(\d{1,2})x(\d{1,2})/);
        ok = em && Number(em[1]) === season && Number(em[2]) === episode;
      } else {
        ok = tokens.length ? tokens.every(t => lower.includes(t)) : true;
      }
      if (!ok) continue;
      relevant.push(`${SUBTITLE_CAT}/${href}`);
      if (relevant.length >= 4) break;
    }
    if (!relevant.length) return [];

    const pages = await Promise.all(
      relevant.slice(0, 3).map(async (url) => {
        try { return parseSubtitleCatRelease(await scatGet(url)); } catch { return []; }
      })
    );

    const byLang = new Map();
    for (const page of pages) {
      for (const s of page) {
        const lang = normalizeLangCode(s.lang);
        if (!lang || byLang.has(lang)) continue;
        byLang.set(lang, {
          lang,
          langName: SUBTITLE_LANG_NAMES[lang] || lang.toUpperCase(),
          fileId: `scat:${Buffer.from(s.path).toString('base64url')}:${lang}`,
        });
      }
    }
    const tracks = [...byLang.values()];
    if (tracks.length) {
      console.log(`[subs] subtitlecat ${title}${isTv ? ` S${season}E${episode}` : ''} -> ${tracks.length} languages`);
    }
    return tracks;
  } catch (err) {
    console.warn(`[subs] subtitlecat failed: ${err.message.slice(0, 120)}`);
    return [];
  }
}

function mergeTracks(lists) {
  const byLang = new Map();
  for (const list of lists) {
    for (const t of list || []) {
      if (!t || !t.lang || !t.fileId) continue;
      if (!byLang.has(t.lang)) byLang.set(t.lang, t);
    }
  }
  return [...byLang.values()];
}

app.get('/api/subtitles', async (req, res) => {
  const tmdbId = Number(req.query.tmdbId);
  const season = req.query.season != null ? Number(req.query.season) : null;
  const episode = req.query.episode != null ? Number(req.query.episode) : null;
  const imdbId = req.query.imdbId ? String(req.query.imdbId) : '';
  if (!tmdbId) return res.status(400).json({ error: 'tmdbId required' });

  const isMovie = season == null || episode == null;
  const cacheKey = isMovie ? `m:${tmdbId}` : `t:${tmdbId}:${season}:${episode}`;
  const hit = subtitleTracksCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 600000) return res.json({ tracks: hit.tracks });

  let title = '';
  try { title = await tmdbTitleFor(tmdbId, isMovie); } catch {}

  const results = await Promise.all([
    subdlApiKey ? searchSubdl(tmdbId, season, episode).catch(err => { console.error('[subs] subdl error:', err.message.slice(0, 120)); return []; }) : Promise.resolve([]),
    isMovie && imdbId ? fetchYifyTracks(imdbId).catch(err => { console.error('[subs] yify error:', err.message.slice(0, 120)); return []; }) : Promise.resolve([]),
    !isMovie && title ? fetchTvSubtitles(title, season, episode).catch(err => { console.error('[subs] tvsubtitles error:', err.message.slice(0, 120)); return []; }) : Promise.resolve([]),
    title ? fetchSubtitleCat(title, season, episode).catch(err => { console.error('[subs] subtitlecat error:', err.message.slice(0, 120)); return []; }) : Promise.resolve([]),
  ]);
  const tracks = mergeTracks(results);
  console.log(`[subs] merged ${tmdbId}${!isMovie ? ` S${season}E${episode}` : ''} -> ${tracks.length} languages`);

  const langFileIds = new Map();
  for (const t of tracks) {
    const arr = langFileIds.get(t.lang) || [];
    arr.push(t.fileId);
    langFileIds.set(t.lang, arr);
  }
  for (const list of results) {
    for (const t of list || []) {
      if (!t || !t.fileId) continue;
      const arr = langFileIds.get(t.lang) || [];
      if (!arr.includes(t.fileId)) { arr.push(t.fileId); langFileIds.set(t.lang, arr); }
    }
  }
  for (const ids of langFileIds.values()) {
    for (const id of ids) {
      subtitleAlts.set(id, ids.filter(x => x !== id));
    }
  }

  subtitleTracksCache.set(cacheKey, { tracks, at: Date.now() });
  res.json({ tracks });
});

async function getSubtitleBuffer(fileId) {
  const cached = subtitleCache.get(fileId);
  if (cached && cached.buf) return cached.buf;

  if (fileId.startsWith('tvs:')) {
    const srt = await tvsSubtitleContent(fileId.replace(/^tvs:/, ''));
    if (srt == null) return null;
    const buf = Buffer.from(srt);
    subtitleCache.set(fileId, { url: fileId, buf });
    console.log(`[subs] tvs cached ${fileId} (${srt.length} chars)`);
    return buf;
  }

  if (fileId.startsWith('yify:')) {
    const slug = fileId.replace(/^yify:/, '');
    const dlUrl = `${YIFY_SUBS}/subtitle/${slug}.zip`;
    let subRes = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        subRes = await fetch(dlUrl, {
          headers: {
            'User-Agent': SUBTITLE_UA,
            Accept: '*/*',
            Referer: `${YIFY_SUBS}/subtitles/${slug}`,
          },
          signal: AbortSignal.timeout(25000),
        });
        if (subRes.ok) break;
      } catch { subRes = null; }
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
    if (!subRes || !subRes.ok) return null;
    const zip = Buffer.from(await subRes.arrayBuffer());
    let srt = extractSrtFromZip(zip);
    if (srt == null) {
      const asText = zip.toString('utf8');
      srt = /^\s*\d{2}:\d{2}:\d{2}/m.test(asText) ? asText : null;
    }
    if (srt == null) return null;
    const buf = Buffer.from(srt);
    subtitleCache.set(fileId, { url: dlUrl, buf });
    console.log(`[subs] yify cached ${fileId} (${srt.length} chars)`);
    return buf;
  }

  if (fileId.startsWith('scat:')) {
    const parts = fileId.split(':');
    const path = parts.length >= 2 ? Buffer.from(parts[1], 'base64url').toString('utf8') : '';
    if (!path.startsWith('/subs/')) return null;
    const dlUrl = `${SUBTITLE_CAT}${path}`;
    let buf = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const srt = await scatGet(dlUrl);
        if (srt && srt.length > 10) { buf = Buffer.from(srt); break; }
      } catch { buf = null; }
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
    if (!buf) return null;
    subtitleCache.set(fileId, { url: dlUrl, buf });
    console.log(`[subs] subtitlecat cached ${fileId} (${buf.length} bytes)`);
    return buf;
  }

  const dlUrl = cached?.url;
  if (!dlUrl) return null;
  let subRes = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      subRes = await fetch(dlUrl, {
        headers: { 'User-Agent': SUBTITLE_UA },
        signal: AbortSignal.timeout(20000),
      });
      if (subRes.ok) break;
    } catch { subRes = null; }
    await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
  }
  if (!subRes || !subRes.ok) return null;
  let buf = Buffer.from(await subRes.arrayBuffer());
  const ctype = subRes.headers.get('content-type') || '';
  if (ctype.includes('zip')) {
    const srt = extractSrtFromZip(buf);
    buf = srt != null ? Buffer.from(srt) : buf;
  }
  subtitleCache.set(fileId, { url: dlUrl, buf });
  console.log(`[subs] cached ${fileId} (${buf.length} bytes)`);
  return buf;
}

async function resolveSubtitleBuffer(fileId) {
  const buf = await getSubtitleBuffer(fileId);
  if (buf) return buf;
  const alts = subtitleAlts.get(fileId) || [];
  for (const alt of alts) {
    const b = await getSubtitleBuffer(alt);
    if (b) return b;
  }
  return null;
}

app.get('/api/subtitles/content/:fileId', async (req, res) => {
  const fileId = String(req.params.fileId);
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  const streamId = req.query.streamId ? String(req.query.streamId) : null;

  try {
    const buf = await resolveSubtitleBuffer(fileId);
    if (!buf) return res.status(502).json({ error: 'subtitle fetch failed' });

    // Handle X-Subtitle-Sync state header
    if (!streamId || !ffsubsyncPath) {
      res.setHeader('X-Subtitle-Sync', 'unavailable');
    } else {
      const cacheKeySync = `sync:${streamId}:${fileId}`;
      const cached = subtitleCache.get(cacheKeySync);
      if (cached?.buf) {
        console.log(`[sync] serving cached synced subtitle for ${fileId}`);
        res.setHeader('X-Subtitle-Sync', 'synced');
        return sendSubtitle(res, cached.buf);
      }

      if (failedSyncs.has(cacheKeySync)) {
        res.setHeader('X-Subtitle-Sync', 'failed');
      } else {
        // Run background sync non-blockingly so initial response is instant (<50ms)
        const s = streams.get(streamId);
        if (s?.file && s?.torrent && !inProgressSyncs.has(cacheKeySync)) {
          const videoPath = path.join(s.torrent.path, s.file.path);
          // Ensure enough REAL video data has arrived (scaled to 3MB or 5% of file)
          const minBytes = Math.min(3 * 1024 * 1024, (s.file.length || 0) * 0.05);
          const hasEnoughData = s.torrent.downloaded >= minBytes && fs.existsSync(videoPath);
          if (hasEnoughData) {
            inProgressSyncs.add(cacheKeySync);
            autoSyncSubtitle(buf, videoPath).then(synced => {
              if (synced) {
                subtitleCache.set(cacheKeySync, { buf: Buffer.from(synced), at: Date.now() });
                console.log(`[sync] background sync saved to cache for ${fileId}`);
              } else {
                failedSyncs.set(cacheKeySync, true);
              }
            }).catch(() => {
              failedSyncs.set(cacheKeySync, true);
            }).finally(() => {
              inProgressSyncs.delete(cacheKeySync);
            });
          }
        }
        res.setHeader('X-Subtitle-Sync', inProgressSyncs.has(cacheKeySync) ? 'syncing' : 'pending');
      }
    }

    return sendSubtitle(res, buf);
  } catch (err) {
    console.error('[subs] content error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of streams) {
    if (now - s.createdAt > 3600000 && !s.downloading) {
      // Only destroy the torrent if no other active stream is using it
      let shared = false;
      for (const [otherId, otherS] of streams.entries()) {
        if (otherId !== id && otherS.torrent === s.torrent) { shared = true; break; }
      }
      if (!shared && s.torrent) {
        try { s.torrent.destroy(); } catch {}
      }
      if (s.ffmpegProc) { try { s.ffmpegProc.kill('SIGKILL'); } catch {} }
      streams.delete(id);
    }
  }
  for (const [hash, p] of prefetches) {
    if (now - p.createdAt > 600000) {
      const isStream = Array.from(streams.values()).some(s => s.torrent?.infoHash === hash);
      if (!isStream) {
        try { p.torrent.destroy(); } catch {}
      }
      prefetches.delete(hash);
    }
  }
}, 120000);

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err.message);
});

process.on('unhandledRejection', (err) => {
  if (err && err.message === 'Writable stream closed prematurely') return;
  console.error('unhandledRejection:', err);
});

function gracefulShutdown() {
  console.log('[server] graceful shutdown triggered...');
  const destroyedTorrents = new Set();
  for (const [id, s] of streams) {
    if (s.ffmpegProc) {
      try { s.ffmpegProc.kill('SIGKILL'); } catch {}
    }
    if (s.torrent && !destroyedTorrents.has(s.torrent)) {
      destroyedTorrents.add(s.torrent);
      try { s.torrent.destroy(); } catch {}
    }
  }
  for (const [hash, p] of prefetches) {
    if (!destroyedTorrents.has(p.torrent)) {
      destroyedTorrents.add(p.torrent);
      try { p.torrent.destroy(); } catch {}
    }
  }
  try { client.destroy(); } catch {}
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const staticPath = path.join(__dirname, '../docs');
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const basename = path.basename(req.path);
    const assetFile = path.join(staticPath, basename);
    if (basename.includes('.') && !basename.endsWith('.html') && fs.existsSync(assetFile)) {
      return res.sendFile(assetFile);
    }
    if (basename.includes('.') && !basename.endsWith('.html')) {
      return res.status(404).end();
    }
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

loadBudget().catch(() => {});
app.listen(PORT, () => console.log(`soulima streaming server running on :${PORT}`));
