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

// Auto-sync a subtitle buffer against a video file using ffsubsync.
// Returns the synced VTT text, or null on failure.
async function autoSyncSubtitle(subBuf, videoPath) {
  if (!ffsubsyncPath) return null;
  if (!fs.existsSync(videoPath)) return null;

  const tmpDir = path.join(os.tmpdir(), 'soulima-sync');
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
        .replace(/WEBVTT[\s\S]*?\n\n/, '')
        .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2');
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
    // Convert back to VTT
    synced = synced.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    synced = 'WEBVTT\n\n' + synced;
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
app.use(cors());
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
const streams = new Map();

function getTempDir(id) {
  return path.join(os.tmpdir(), 'soulima-stream', id);
}

function pickVideoFile(files) {
  return files.find(f => f.name.toLowerCase().endsWith('.mp4'))
      || files.find(f => f.name.toLowerCase().endsWith('.webm'))
      || files.find(f => f.name.toLowerCase().endsWith('.mkv'));
}

app.post('/api/stream', async (req, res) => {
  const { magnet } = req.body;
  if (!magnet) return res.status(400).json({ error: 'magnet required' });
  console.log('[stream] POST received magnet:', magnet.slice(0, 80));
  if (!magnet.startsWith('magnet:?xt=urn:btih:')) {
    return res.status(400).json({ error: 'invalid magnet link' });
  }

  // Ensure magnet has tracker parameters for instant peer discovery
  let enrichedMagnet = magnet;
  if (!magnet.includes('&tr=')) {
    const trStr = BOOTSTRAP_TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
    enrichedMagnet += (magnet.includes('?') ? '&' : '?') + trStr;
  }

  const id = crypto.randomBytes(6).toString('hex');

  const infoHashMatch = magnet.match(/xt=urn:btih:([a-fA-F0-9]+)/);
  const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null;

  try {
    const existing = infoHash ? await client.get(`magnet:?xt=urn:btih:${infoHash}`) : null;
    if (existing) {
      if (!existing.files.length) {
        await new Promise((resolve, reject) => {
          const onMeta = () => { existing.removeListener('error', onErr); resolve(); };
          const onErr = (err) => { existing.removeListener('metadata', onMeta); reject(err); };
          existing.once('metadata', onMeta);
          existing.once('error', onErr);
        });
      }
      const file = pickVideoFile(existing.files);
      if (!file) {
        return res.status(404).json({ error: 'no playable video file in torrent' });
      }

      try {
        if (existing.pieces?.length) {
          existing.deselect(0, existing.pieces.length - 1, 0);
          file.select();
          const n = existing.pieces.length;
          existing.critical(0, Math.min(20, n - 1));
          if (n > 20) existing.critical(Math.max(0, n - 8), n - 1);
        }
      } catch {}

      streams.set(id, { torrent: existing, file, createdAt: Date.now() });
      const base = `${req.protocol}://${req.get('host')}`;
      return res.json({
        id,
        streamUrl: `${base}/api/stream/${id}`,
        statusUrl: `${base}/api/stream/${id}/status`,
        fileName: file.name,
        size: file.length,
      });
    }

    const timeoutMs = 25000;
    const torrent = await new Promise((resolve, reject) => {
      let t;
      try {
        t = client.add(enrichedMagnet, {
          path: getTempDir(id),
          announce: BOOTSTRAP_TRACKERS,
          maxConns: 300,
          strategy: 'sequential',
        });
      } catch (e) {
        reject(new Error('failed to add torrent'));
        return;
      }
      const onMeta = () => { clearTimeout(timeout); resolve(t); };
      const onErr = (err) => { clearTimeout(timeout); t.destroy(); reject(err); };
      const timeout = setTimeout(() => {
        t.removeListener('metadata', onMeta);
        t.removeListener('error', onErr);
        t.destroy();
        reject(new Error('metadata timeout'));
      }, timeoutMs);
      t.once('metadata', onMeta);
      t.once('error', onErr);
      t.on('warning', () => {});
    });

    const file = pickVideoFile(torrent.files);

    if (!file) {
      torrent.destroy();
      return res.status(404).json({ error: 'no playable video file in torrent' });
    }

    try {
      if (torrent.pieces?.length) {
        torrent.deselect(0, torrent.pieces.length - 1, 0);
        file.select();
        const n = torrent.pieces.length;
        // Priority download for start of video (first 20 pieces) & end of video (moov atom)
        torrent.critical(0, Math.min(20, n - 1));
        if (n > 20) torrent.critical(Math.max(0, n - 8), n - 1);
      }
    } catch {}

    streams.set(id, { torrent, file, createdAt: Date.now() });
    const base = `${req.protocol}://${req.get('host')}`;

    res.json({
      id,
      streamUrl: `${base}/api/stream/${id}`,
      statusUrl: `${base}/api/stream/${id}/status`,
      fileName: file.name,
      size: file.length,
    });
  } catch (err) {
    console.error('[stream] POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stream/prefetch', async (req, res) => {
  const { magnet } = req.body;
  if (!magnet || !magnet.startsWith('magnet:?xt=urn:btih:')) {
    return res.status(400).json({ error: 'invalid magnet' });
  }
  const infoHashMatch = magnet.match(/xt=urn:btih:([a-fA-F0-9]+)/);
  const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null;
  if (!infoHash) return res.status(400).json({ error: 'invalid infoHash' });

  try {
    let existing = client.get(`magnet:?xt=urn:btih:${infoHash}`);
    if (!existing) {
      let enrichedMagnet = magnet;
      if (!magnet.includes('&tr=')) {
        const trStr = BOOTSTRAP_TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
        enrichedMagnet += (magnet.includes('?') ? '&' : '?') + trStr;
      }
      existing = client.add(enrichedMagnet, {
        path: path.join(os.tmpdir(), 'soulima-prefetch', infoHash),
        announce: BOOTSTRAP_TRACKERS,
        maxConns: 300,
        strategy: 'sequential',
      });
    }
    res.json({ ok: true, infoHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stream/:id', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'stream not found' });

  const { file, torrent } = s;
  const range = req.headers.range;
  const mime = file.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4';
  const id = req.params.id;

  console.log(`[stream] GET /api/stream/${id} range=${range || '(none)'} downloaded=${(torrent.downloaded / 1048576).toFixed(1)}MB peers=${torrent.numPeers}`);

  let sent = 0;

  const pipeStream = (start, end) => {
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${file.length}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    const rs = file.createReadStream({ start, end });
    rs.on('data', (chunk) => { sent += chunk.length; });
    rs.on('error', () => {});
    rs.pipe(res);
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
      const startPiece = Math.floor(start / pLen);
      const endPiece = Math.floor(Math.min(end, file.length - 1) / pLen);
      try {
        torrent.critical(startPiece, Math.min(endPiece, startPiece + 15));
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
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const isVtt = /^\s*WEBVTT/i.test(text);
  text = sanitizeSubtitleText(text);
  if (isVtt) {
    text = text.replace(/WEBVTT[\s\S]*?^\s*$/m, '');
    text = text.replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2');
  }
  return text;
}

async function muxWithSubtitle(req, res, s, fileId, lang) {
  const { torrent, file } = s;
  const sourcePath = path.join(torrent.path, file.path);
  if (!fs.existsSync(sourcePath)) return false;
  const subBuf = await resolveSubtitleBuffer(fileId);
  if (!subBuf) return false;
  const srt = toSrt(subBuf);
  if (!srt.trim()) return false;
  const tmpSub = path.join(getTempDir(req.params.id), `.soulima-subs-${process.pid}.srt`);
  await fs.promises.writeFile(tmpSub, srt);
  const baseName = file.name.replace(/\.(mkv|mp4|webm|avi)$/i, '') || 'video';
  const outName = `${baseName} (${(lang || 'und').toUpperCase()}).mkv`.replace(/[^\w.\- ()]/g, '_');
  console.log(`[mux] ${file.name} + ${fileId} (${lang || 'und'}) -> ${outName}`);
  try {
    const args = [
      '-y', '-loglevel', 'error',
      '-i', sourcePath,
      '-i', tmpSub,
      '-map', '0:v:0', '-map', '0:a:0?', '-map', '1:0',
      '-c', 'copy', '-c:s', 'srt',
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

app.get('/api/stream/:id/download', async (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'stream not found' });

  const { file } = s;
  const subtitleId = req.query.subtitle ? String(req.query.subtitle) : '';
  const lang = req.query.lang ? String(req.query.lang) : '';

  if (subtitleId && s.torrent.done) {
    try {
      const ok = await muxWithSubtitle(req, res, s, subtitleId, lang);
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

app.get('/api/stream/:id/status', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'stream not found' });

  const { torrent } = s;
  const ready = torrent.done || torrent.progress > 0.01;
  res.json({
    downloaded: torrent.downloaded,
    total: torrent.length,
    progress: torrent.progress,
    speed: torrent.downloadSpeed,
    peers: torrent.numPeers,
    ready,
  });
});

app.delete('/api/stream/:id', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'stream not found' });
  s.torrent.destroy();
  streams.delete(req.params.id);
  res.json({ ok: true });
});

/* ─── Series torrent search (TPB proxy) ───────────────────────────────────── */
const TMDB_API_KEY = 'acc5f02e54fa612710d3245f53f29600';
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
  const year = new Date().getFullYear();
  const queries = [query, query, query, query, `${query} ${year - 1}`, `${query} ${year}`];
  for (let attempt = 0; attempt < queries.length; attempt++) {
    try {
      const url = `https://apibay.org/q.php?q=${encodeURIComponent(queries[attempt])}`;
      const { stdout } = await execFileAsync(
        'curl',
        ['-s', '-m', '20', '-A', SUBTITLE_UA, url],
        { timeout: 25000 }
      );
      const list = JSON.parse(stdout);
      if (
        Array.isArray(list)
        && list.length
        && list[0].info_hash
        && list[0].info_hash !== '0000000000000000000000000000000000000000'
      ) {
        console.log(`[search] apibay ok: ${queries[attempt]} -> ${list.length} rows`);
        return list;
      }
      console.log(`[search] apibay empty: ${queries[attempt]} -> ${Array.isArray(list) ? list.length : 'n/a'}`);
    } catch (err) {
      console.error(`[search] apibay attempt ${attempt + 1} failed:`, err.message);
    }
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
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

async function tmdbTitle(tmdbId) {
  const url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tmdb lookup failed (${res.status})`);
  const d = await res.json();
  let imdbId = d.imdb_id || '';
  if (!imdbId) {
    const extRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`);
    if (extRes.ok) {
      const ext = await extRes.json();
      imdbId = ext.imdb_id || '';
    }
  }
  return {
    title: d.name || d.original_name || '',
    imdbId: imdbId.replace(/^tt/, ''),
  };
}

async function bitSearchSources(title, season, episode) {
  const tag = seriesEpiTag(season, episode);
  const query = `${title} ${tag}`;
  const out = [];
  const url = `https://bitsearch.to/search?q=${encodeURIComponent(query)}`;
  let stdout = '';
  for (let attempt = 1; attempt <= 3 && !stdout; attempt++) {
    try {
      const res = await execFileAsync(
        'curl',
        ['-s', '-L', '-m', '25', '-A', SUBTITLE_UA, url],
        { timeout: 30000 }
      );
      stdout = res.stdout;
    } catch (err) {
      console.warn(`[search] bitsearch attempt ${attempt} failed: ${err.message.slice(0, 100)}`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
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

      if (!name || !name.toLowerCase().includes(tag) || !showNameMatches(title, name, tag)) continue;
      out.push({
        quality: qualityFromName(name),
        magnet,
        size,
        seeds,
      });
    }
    console.log(`[search] bitsearch: ${title} ${tag} -> ${out.length} sources`);
  } catch (err) {
    console.warn(`[search] bitsearch failed: ${err.message}`);
  }
  return out;
}

app.get('/api/search', async (req, res) => {
  const tmdbId = Number(req.query.tmdbId);
  const season = Number(req.query.season);
  const episode = Number(req.query.episode);
  if (!tmdbId || !season || !episode) {
    return res.status(400).json({ error: 'tmdbId, season, episode required' });
  }

  try {
    const { title, imdbId } = await tmdbTitle(tmdbId);
    const tag = seriesEpiTag(season, episode);
    console.log(`[search] ${title} ${tag} -> apibay + bitsearch`);

    const [tpbList, bitList] = await Promise.allSettled([
      apibaySearch(title),
      bitSearchSources(title, season, episode),
    ]);

    const tpb = [];
    const list = tpbList.status === 'fulfilled' ? tpbList.value : [];
    const filtered = (list || []).filter(t =>
      t.info_hash && t.name && t.name.toLowerCase().includes(tag) && showNameMatches(title, t.name, tag)
    );
    const seeded = filtered.filter(t => Number(t.seeders || 0) > 0);
    tpb.push(...(seeded.length ? seeded : filtered).map(t => ({
      quality: qualityFromName(t.name),
      magnet: magnetFromHash(t.info_hash, t.name),
      size: formatSize(Number(t.size) || 0),
      seeds: Number(t.seeders || 0),
    })));

    const merged = new Map();
    for (const s of [...tpb, ...(bitList.status === 'fulfilled' ? bitList.value : [])]) {
      const m = (s.magnet || '').match(/btih:([a-f0-9]{40})/i);
      const key = m ? m[1] : s.magnet;
      const prev = merged.get(key);
      if (!prev || s.seeds > prev.seeds) merged.set(key, s);
    }

    const sources = [...merged.values()]
      .sort((a, b) => b.seeds - a.seeds)
      .slice(0, 4);

    res.json({ title, season, episode, sources });
  } catch (err) {
    console.error('[search] error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

const subtitleCache = new Map();
const subtitleTracksCache = new Map();
const subtitleAlts = new Map();

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
        if (method === 0) return data.toString('utf8');
        if (method === 8) return zlib.inflateRawSync(data).toString('utf8');
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

function sendSubtitle(res, buf) {
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
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
          const zeroBased = fs === season + 1 && fe === episode + 1;
          if (!exact && !zeroBased) continue;
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

    // Check if we already have a cached background-synced version
    if (ffsubsyncPath && streamId) {
      const cacheKeySync = `sync:${streamId}:${fileId}`;
      const cached = subtitleCache.get(cacheKeySync);
      if (cached?.buf) {
        console.log(`[sync] serving cached synced subtitle for ${fileId}`);
        return sendSubtitle(res, cached.buf);
      }

      // Run background sync non-blockingly so response is instant (<50ms)
      const s = streams.get(streamId);
      if (s?.file && s?.torrent) {
        const videoPath = path.join(s.torrent.path, s.file.path);
        const videoExists = fs.existsSync(videoPath) && fs.statSync(videoPath).size > 10 * 1024 * 1024;
        if (videoExists) {
          autoSyncSubtitle(buf, videoPath).then(synced => {
            if (synced) {
              subtitleCache.set(cacheKeySync, { buf: Buffer.from(synced), at: Date.now() });
              console.log(`[sync] background sync saved to cache for ${fileId}`);
            }
          }).catch(() => {});
        }
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
    if (now - s.createdAt > 3600000) {
      s.torrent.destroy();
      streams.delete(id);
    }
  }
}, 600000);

client.on('error', () => {});

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err.message);
});

process.on('unhandledRejection', (err) => {
  if (err && err.message === 'Writable stream closed prematurely') return;
  console.error('unhandledRejection:', err);
});

const PORT = process.env.PORT || 3030;
app.listen(PORT, () => console.log(`soulima streaming server running on :${PORT}`));
