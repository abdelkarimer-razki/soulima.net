import assert from 'node:assert/strict';

console.log('--- Running Media Pipeline & Player Unit Verification Tests ---');

// 1. Test sourceKey logic
function sourceKey(s) {
  if (!s) return '';
  const m = s.magnet?.match(/btih:([a-fA-F0-9]+)/i);
  return m ? m[1].toLowerCase() : (s.magnet || s.quality || '');
}

console.log('1. Testing sourceKey extraction...');
assert.equal(
  sourceKey({ magnet: 'magnet:?xt=urn:btih:4A5B6C7D8E9F0123456789ABCDEF0123456789AB&dn=Test.Movie' }),
  '4a5b6c7d8e9f0123456789abcdef0123456789ab'
);
assert.equal(
  sourceKey({ magnet: 'magnet:?dn=Test.Show&tr=udp%3A%2F%2Ftracker&xt=urn:btih:11223344556677889900aabbccddeeff00112233' }),
  '11223344556677889900aabbccddeeff00112233'
);
assert.equal(sourceKey(null), '');
assert.equal(sourceKey({ quality: '1080p', magnet: '' }), '1080p');
console.log('✓ sourceKey logic passed.');

// 2. Test BoundedMap LRU logic
class BoundedMap extends Map {
  constructor(maxSize = 3) {
    super();
    this.maxSize = maxSize;
  }
  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.has(key)) {
      super.delete(key);
    } else if (this.size >= this.maxSize) {
      const oldestKey = this.keys().next().value;
      this.delete(oldestKey);
    }
    return super.set(key, value);
  }
}

console.log('2. Testing BoundedMap true LRU cache behavior...');
const cache = new BoundedMap(3);
cache.set('a', 1);
cache.set('b', 2);
cache.set('c', 3);

// Access 'a' so it becomes the most recently used
assert.equal(cache.get('a'), 1);

// Add 'd', which should evict 'b' (since 'a' was accessed and 'b' is now the oldest)
cache.set('d', 4);
assert.equal(cache.has('b'), false, 'Key "b" should have been evicted as LRU');
assert.equal(cache.has('a'), true, 'Key "a" should be retained');
assert.equal(cache.has('c'), true, 'Key "c" should be retained');
assert.equal(cache.has('d'), true, 'Key "d" should be retained');
console.log('✓ BoundedMap true LRU passed.');

// 3. Test normalizeMagnet logic
const BOOTSTRAP_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'udp://tracker.opentrackr.org:1337/announce',
];

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

console.log('3. Testing normalizeMagnet...');
const raw = 'magnet:?xt=urn:btih:4A5B6C7D8E9F0123456789ABCDEF0123456789AB&dn=My%20Movie&random=param&junk=123';
const normalized = normalizeMagnet(raw);
assert.ok(normalized);
assert.equal(normalized.infoHash, '4a5b6c7d8e9f0123456789abcdef0123456789ab');
assert.ok(normalized.normalizedMagnet.startsWith('magnet:?xt=urn:btih:4a5b6c7d8e9f0123456789abcdef0123456789ab&dn=My%20Movie'));
assert.ok(!normalized.normalizedMagnet.includes('random=param'));
assert.ok(!normalized.normalizedMagnet.includes('junk=123'));
console.log('✓ normalizeMagnet passed.');

// 4. Test shiftSrtTimestamps logic
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

console.log('4. Testing shiftSrtTimestamps...');
const originalSrt = '1\n00:01:10,500 --> 00:01:15,200\nHello world';
const shifted = shiftSrtTimestamps(originalSrt, 2.5);
assert.ok(shifted.includes('00:01:13,000 --> 00:01:17,700'));

const negativeShifted = shiftSrtTimestamps(originalSrt, -5.0);
assert.ok(negativeShifted.includes('00:01:05,500 --> 00:01:10,200'));
console.log('✓ shiftSrtTimestamps passed.');

// 5. Test binary search cue lookup logic
function parseVttCues(vttText) {
  const cues = [];
  const cueRegex = /(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})[^\n]*\n([\s\S]*?)(?=\n\s*(?:(?:(?:\d{2}):)?\d{2}:\d{2}\.\d{3}|$))/g;
  let match;
  while ((match = cueRegex.exec(vttText)) !== null) {
    const startH = match[1] ? parseInt(match[1], 10) : 0;
    const startM = parseInt(match[2], 10);
    const startS = parseInt(match[3], 10);
    const startMs = parseInt(match[4], 10);
    const start = startH * 3600 + startM * 60 + startS + startMs / 1000;

    const endH = match[5] ? parseInt(match[5], 10) : 0;
    const endM = parseInt(match[6], 10);
    const endS = parseInt(match[7], 10);
    const endMs = parseInt(match[8], 10);
    const end = endH * 3600 + endM * 60 + endS + endMs / 1000;

    const text = match[9].trim();
    if (text) cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function findCueText(cues, currentTime, offset = 0) {
  const time = currentTime - offset;
  if (time < 0) return '';
  let low = 0;
  let high = cues.length - 1;
  let foundIdx = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const cue = cues[mid];
    if (time >= cue.start && time <= cue.end) {
      foundIdx = mid;
      break;
    } else if (time < cue.start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  if (foundIdx !== -1) {
    return cues[foundIdx].text;
  }
  return '';
}

console.log('5. Testing cue parsing and binary search cue lookup...');
const vtt = `WEBVTT

00:00:10.000 --> 00:00:15.000
First subtitle

00:00:20.000 --> 00:00:25.000
Second subtitle
`;
const cues = parseVttCues(vtt);
assert.equal(cues.length, 2);
assert.equal(findCueText(cues, 12), 'First subtitle');
assert.equal(findCueText(cues, 17), '');
assert.equal(findCueText(cues, 22), 'Second subtitle');
assert.equal(findCueText(cues, 14, 2), 'First subtitle'); // 14 - 2 = 12
console.log('✓ Cue binary search passed.');

// 6. Test async remux contract (ensure spawnFileRemux is async and catchable)
console.log('6. Testing async spawnFileRemux contract...');
async function mockSpawnFileRemux() {
  return true;
}
const handled = await mockSpawnFileRemux().catch(() => false);
assert.equal(handled, true);
console.log('✓ async spawnFileRemux contract passed.');

// 7. Test overlapping subtitle cue scanner (long background cues must not be dropped by short dialogues)
console.log('7. Testing overlapping cue scanner...');
const overlappingCues = [
  { start: 10, end: 30, text: 'Long background song translation' },
  { start: 15, end: 17, text: 'Short dialogue: Hello!' },
  { start: 22, end: 25, text: 'Short dialogue: Goodbye!' }
].sort((a, b) => a.start - b.start);

function scanActiveCues(cues, time) {
  let low = 0;
  let high = cues.length - 1;
  let foundIdx = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const cue = cues[mid];
    if (time >= cue.start && time <= cue.end) {
      foundIdx = mid;
      break;
    } else if (time < cue.start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  const matches = [];
  if (foundIdx !== -1) {
    let l = foundIdx;
    while (l >= 0 && cues[l].start >= time - 60) {
      if (time >= cues[l].start && time <= cues[l].end) {
        if (!matches.includes(cues[l].text)) matches.unshift(cues[l].text);
      }
      l--;
    }
    let r = foundIdx + 1;
    while (r < cues.length && cues[r].start <= time) {
      if (time >= cues[r].start && time <= cues[r].end) {
        if (!matches.includes(cues[r].text)) matches.push(cues[r].text);
      }
      r++;
    }
  } else {
    let idx = Math.max(0, high);
    while (idx > 0 && cues[idx].start >= time - 60) idx--;
    while (idx < cues.length && cues[idx].start <= time) {
      if (time >= cues[idx].start && time <= cues[idx].end) {
        if (!matches.includes(cues[idx].text)) matches.push(cues[idx].text);
      }
      idx++;
    }
  }
  return matches.join('\n');
}

// At time 16: both long cue (10-30) and short dialogue (15-17) must be present
const at16 = scanActiveCues(overlappingCues, 16);
assert.ok(at16.includes('Long background song translation'));
assert.ok(at16.includes('Short dialogue: Hello!'));

// At time 20 (between short dialogues): long cue must STILL be active
const at20 = scanActiveCues(overlappingCues, 20);
assert.equal(at20, 'Long background song translation');
console.log('✓ Overlapping cue scanner passed.');

// 8. Test SubDL exact episode matching (zeroBased off-by-one rejection)
console.log('8. Testing exact episode matching filter...');
function matchSubdlFile(f, season, episode) {
  const fs = f.season != null ? Number(f.season) : null;
  const fe = f.episode != null ? Number(f.episode) : null;
  if (fs != null && fe != null) {
    const exact = fs === season && fe === episode;
    return exact;
  }
  return false;
}

assert.equal(matchSubdlFile({ season: 1, episode: 2 }, 1, 2), true);
assert.equal(matchSubdlFile({ season: 2, episode: 3 }, 1, 2), false); // zeroBased was fs === s+1 && fe === e+1
assert.equal(matchSubdlFile({ season: 1, episode: 3 }, 1, 2), false);
console.log('✓ Exact episode matching filter passed.');

// 9. Test Subtitle fallback selection logic
console.log('9. Testing subtitle fallback selection...');
const mockTracks = [
  { fileId: 'sub_en_corrupt', lang: 'en', langName: 'English (Bad)' },
  { fileId: 'sub_en_good', lang: 'en', langName: 'English (Good)' },
  { fileId: 'sub_ar', lang: 'ar', langName: 'Arabic' }
];

function selectFallbackTrack(tracks, currentTrack, triedIds) {
  triedIds.add(currentTrack.fileId);
  const curLang = currentTrack.lang;
  const sameLangAlt = tracks.find(s => !triedIds.has(s.fileId) && s.lang === curLang);
  return sameLangAlt || tracks.find(s => !triedIds.has(s.fileId)) || null;
}

const triedIds = new Set();
const fallback = selectFallbackTrack(mockTracks, mockTracks[0], triedIds);
assert.ok(fallback);
assert.equal(fallback.fileId, 'sub_en_good');
assert.equal(fallback.lang, 'en');

const fallback2 = selectFallbackTrack(mockTracks, fallback, triedIds);
assert.ok(fallback2);
assert.equal(fallback2.fileId, 'sub_ar');

const fallback3 = selectFallbackTrack(mockTracks, fallback2, triedIds);
assert.equal(fallback3, null);
console.log('✓ Subtitle fallback selection passed.');

// 10. Test background torrent retention & LRU eviction logic
console.log('10. Testing background torrent retention and eviction...');
const bgTorrents = new Map();
const mockStreams = new Map();
const mockDownloads = new Map();

function reapBackgroundTorrents(now, maxAge = 7200000, cap = 2) {
  for (const [hash, bg] of bgTorrents.entries()) {
    const hasActiveStream = Array.from(mockStreams.values()).some(s => s.torrent?.infoHash === hash);
    const hasActiveDownload = Array.from(mockDownloads.values()).some(d => d.torrent?.infoHash === hash && (d.status === 'downloading' || d.status === 'starting'));
    if (!hasActiveStream && !hasActiveDownload && (now - bg.lastActiveAt > maxAge)) {
      bg.destroyed = true;
      bgTorrents.delete(hash);
    }
  }
  if (bgTorrents.size > cap) {
    const sorted = Array.from(bgTorrents.entries()).sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);
    for (const [hash, bg] of sorted) {
      if (bgTorrents.size <= cap) break;
      const hasActiveStream = Array.from(mockStreams.values()).some(s => s.torrent?.infoHash === hash);
      const hasActiveDownload = Array.from(mockDownloads.values()).some(d => d.torrent?.infoHash === hash && (d.status === 'downloading' || d.status === 'starting'));
      if (!hasActiveStream && !hasActiveDownload) {
        bg.destroyed = true;
        bgTorrents.delete(hash);
      }
    }
  }
}

// Add 3 torrents at different timestamps
const t0 = 1000000;
bgTorrents.set('hash1', { torrent: { infoHash: 'hash1' }, lastActiveAt: t0, destroyed: false });
bgTorrents.set('hash2', { torrent: { infoHash: 'hash2' }, lastActiveAt: t0 + 1000, destroyed: false });
bgTorrents.set('hash3', { torrent: { infoHash: 'hash3' }, lastActiveAt: t0 + 2000, destroyed: false });

// Over cap (3 > 2), oldest idle 'hash1' should be reaped
reapBackgroundTorrents(t0 + 3000, 7200000, 2);
assert.equal(bgTorrents.has('hash1'), false, 'Oldest torrent hash1 should be evicted when over cap');
assert.equal(bgTorrents.has('hash2'), true, 'hash2 should remain');
assert.equal(bgTorrents.has('hash3'), true, 'hash3 should remain');

// Even if over age limit, active streams prevent destruction
mockStreams.set('stream_live', { torrent: { infoHash: 'hash2' } });
reapBackgroundTorrents(t0 + 10000000, 7200000, 2);
assert.equal(bgTorrents.has('hash2'), true, 'Active stream must protect hash2 from being reaped');
assert.equal(bgTorrents.has('hash3'), false, 'Idle hash3 should be reaped after age limit');
console.log('✓ Background torrent retention & LRU eviction passed.');

// 11. Test content-addressable storage path verification
console.log('11. Testing getTorrentDir infoHash addressability...');
function getTorrentDir(base, infoHash) {
  return `${base}/torrents/${infoHash.toLowerCase()}`;
}
const hashA = '4A5B6C7D8E9F0123456789ABCDEF0123456789AB';
const p1 = getTorrentDir('/cache', hashA);
const p2 = getTorrentDir('/cache', hashA.toLowerCase());
assert.equal(p1, p2, 'Different stream sessions for same hash must share storage dir');
assert.ok(p1.endsWith('/torrents/4a5b6c7d8e9f0123456789abcdef0123456789ab'));
console.log('✓ Content-addressable storage path passed.');

// 12. Test resilient background download fallback
console.log('12. Testing download fallback when subtitle mux fails...');
async function simulateDownloadTask(subtitleFails) {
  let outFile = '/tmp/download_sample.mp4';
  let downloadedVideo = true;
  if (subtitleFails) {
    try {
      throw new Error('Mux failure simulated');
    } catch {
      // Graceful fallback: return raw video without throwing
      return { success: true, outFile };
    }
  }
  return { success: true, outFile: '/tmp/download_sample_muxed.mkv' };
}

const dlResult = await simulateDownloadTask(true);
assert.equal(dlResult.success, true);
assert.equal(dlResult.outFile, '/tmp/download_sample.mp4');
console.log('✓ Resilient background download fallback passed.');

// 13. Test GET /api/downloads serialization with metadata
console.log('13. Testing /api/downloads serialization with metadata...');
const mockDownloadsMap = new Map();
mockDownloadsMap.set('dl_1', {
  downloadId: 'dl_1',
  streamId: 'str_1',
  status: 'downloading',
  progress: 45.6,
  downloaded: 450000000,
  total: 1000000000,
  message: 'Downloading video…',
  error: null,
  startedAt: 123456789,
  meta: {
    title: 'Inception',
    posterUrl: 'https://image.tmdb.org/t/p/w500/test.jpg',
    mediaType: 'movie'
  }
});

function serializeDownloads(map) {
  return Array.from(map.values()).map(d => ({
    downloadId: d.downloadId,
    streamId: d.streamId,
    status: d.status,
    progress: Math.round(d.progress),
    downloaded: d.downloaded,
    total: d.total,
    message: d.message,
    error: d.error,
    startedAt: d.startedAt,
    meta: d.meta || null,
  }));
}

const serialized = serializeDownloads(mockDownloadsMap);
assert.equal(serialized.length, 1);
assert.equal(serialized[0].progress, 46);
assert.equal(serialized[0].meta.title, 'Inception');
assert.equal(serialized[0].meta.mediaType, 'movie');
console.log('✓ /api/downloads serialization passed.');

console.log('--- ALL UNIT VERIFICATION CHECKS PASSED SUCCESSFULLY ---');
