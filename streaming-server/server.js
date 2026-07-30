const express = require('express');
const cors = require('cors');
const WebTorrent = require('webtorrent');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const client = new WebTorrent();
const streams = new Map();

function getTempDir(id) {
  return path.join(os.tmpdir(), 'soulima-stream', id);
}

app.post('/api/stream', async (req, res) => {
  const { magnet } = req.body;
  if (!magnet) return res.status(400).json({ error: 'magnet required' });

  const id = crypto.randomBytes(6).toString('hex');

  try {
    const torrent = await new Promise((resolve, reject) => {
      const t = client.add(magnet, { path: getTempDir(id) });
      t.on('metadata', () => resolve(t));
      t.on('error', (err) => reject(err));
      t.on('warning', () => {});
      setTimeout(() => reject(new Error('metadata timeout after 30s')), 30000);
    });

    const file = torrent.files.find(f =>
      f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.webm')
    );

    if (!file) {
      torrent.destroy();
      return res.status(404).json({ error: 'no playable video file in torrent' });
    }

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
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stream/:id', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'stream not found' });

  const { file } = s;
  const range = req.headers.range;
  const mime = file.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4';

  const pipeStream = (start, end) => {
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${file.length}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    file.createReadStream({ start, end }).pipe(res);
  };

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
    pipeStream(start, Math.min(end, file.length - 1));
  } else {
    res.writeHead(200, {
      'Content-Length': file.length,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    file.createReadStream().pipe(res);
  }

  req.on('close', () => {
    if (req.destroyed) {
      // client disconnected
    }
  });
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

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of streams) {
    if (now - s.createdAt > 3600000) {
      s.torrent.destroy();
      streams.delete(id);
    }
  }
}, 600000);

const PORT = process.env.PORT || 3030;
app.listen(PORT, () => console.log(`soulima streaming server running on :${PORT}`));
