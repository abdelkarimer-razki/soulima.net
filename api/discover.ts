/**
 * /api/discover
 *
 * Auto-discovery of working embed providers.
 *
 * Strategy:
 *  1. Reachability-filter every candidate (origin fetch, challenge/shell detection).
 *  2. Format-probe the survivors: try each known embed URL pattern for a sample
 *     movie (550) & TV title (1399/1/1) and score the body for player markers.
 *  3. Always keep reachable seed (known-good) entries; only ADD new candidates
 *     that show strong player evidence, with their detected format.
 *
 * Request body (optional): { candidates?: string[] }  // extra base URLs to probe
 * Response:              { servers: ServerEntry[], tested: Diagnostics[], updatedAt }
 */
export const config = { maxDuration: 60 };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CHALLENGE_MARKERS = [
  'performing security verification',
  'verifies you are not a bot',
  'checking your browser before accessing',
  'cf-browser-verification',
  'cf-chl-bypass',
  'just a moment',
  'attention required!',
  'verify you are human',
  'enable javascript and cookies',
];

const MIN_CONTENT_LENGTH = 50;

const SAMPLE_MOVIE = 550;        // Fight Club
const SAMPLE_TV = 1399;          // Game of Thrones
const SAMPLE_SEASON = 1;
const SAMPLE_EPISODE = 1;

const CONCURRENCY = 6;
const REACH_TIMEOUT = 4000;
const PROBE_TIMEOUT = 6000;
const DEADLINE_MS = 50000;

const EVIDENCE_THRESHOLD = 6;
const STRONG_THRESHOLD = 10;

/** Player-evidence markers, most specific first. Case-insensitive. */
const MARKERS: { re: RegExp; score: number }[] = [
  { re: /\.m3u8/i, score: 12 },
  { re: /<video\b/i, score: 10 },
  { re: /sources\s*:/i, score: 8 },
  { re: /source\s*:\s*['"]?[^'",}\s]{4,}/i, score: 8 },
  { re: /["']file["']\s*:\s*['"]?[^'"]{4,}/i, score: 7 },
  { re: /hls\.js|hlsjs|hls\b/i, score: 6 },
  { re: /videojs|jwplayer|clappr|dashjs|fluid-player|plyr|native-player|theoplayer|shaka-player/i, score: 5 },
  { re: /<iframe\b[^>]*src=/i, score: 4 },
  { re: /__NEXT_DATA__|__NUXT__|window\.App|createRoot\s*\(|new Vue/i, score: 2 },
  { re: /\btmdb\b/i, score: 2 },
  { re: /\bplayer\b/i, score: 1 },
];

/** vidsrc-brand mirrors to auto-probe for domain migrations. */
const VIDSRC_TLDS = ['sbs', 'ru', 'nl', 'dev', 'net', 'su', 'to', 'me', 'in', 'io', 'ic', 'ws', 'xyz', 'cc'];

interface ServerEntry { name: string; url: string; format: string }
interface Diagnostics { url: string; status: 'online' | 'offline'; statusCode: number; contentLength: number; score: number; evidence?: string[]; format?: string }

/** Known-good entries kept as a baseline when reachable. */
const SEED: ServerEntry[] = [
  { name: 'Vidlink',            url: 'https://vidlink.pro',       format: 'vidlink' },
  { name: 'Multiembed',         url: 'https://multiembed.mov',    format: 'multiembed' },
  { name: 'SuperEmbed',         url: 'https://superembed.stream', format: 'superembed' },
  { name: '2Embed',             url: 'https://2embed.cc/embed',   format: 'embed-direct' },
  { name: 'Cineby',             url: 'https://cineby.app',        format: 'cineby' },
  { name: 'Vidsrc.me (mirror)', url: 'https://vidsrcme.ru/embed', format: 'standard' },
  { name: 'Vidsrc.nl',          url: 'https://vidsrc.nl',         format: 'standard' },
  { name: 'Vidsrc.sbs',         url: 'https://vidsrc.sbs/embed',  format: 'standard' },
];

interface Probe {
  movie: (base: string, origin: string) => string;
  tv: (base: string, origin: string) => string;
  format: string;
  urlFor: (base: string, origin: string) => string;
}

/** Candidate base URLs. */
const PROBES: Probe[] = [
  { format: 'vidlink',       urlFor: (_b, o) => o, movie: (b, o) => `${o}/movie/${SAMPLE_MOVIE}`,         tv: (b, o) => `${o}/tv/${SAMPLE_TV}/${SAMPLE_SEASON}/${SAMPLE_EPISODE}` },
  { format: 'standard',      urlFor: (b, _o) => b, movie: (b, o) => `${b}/movie/${SAMPLE_MOVIE}`,         tv: (b, o) => `${b}/tv/${SAMPLE_TV}/${SAMPLE_SEASON}/${SAMPLE_EPISODE}` },
  { format: 'embed-direct',  urlFor: (b, _o) => b, movie: (b) => `${b}/${SAMPLE_MOVIE}`,                  tv: (b) => `${b}/${SAMPLE_TV}/${SAMPLE_SEASON}/${SAMPLE_EPISODE}` },
  { format: 'superembed',    urlFor: (_b, o) => o, movie: (o) => `${o}/?tmdb=1&id=${SAMPLE_MOVIE}`,       tv: (o) => `${o}/?tmdb=1&id=${SAMPLE_TV}&s=${SAMPLE_SEASON}&e=${SAMPLE_EPISODE}` },
  { format: 'multiembed',    urlFor: (_b, o) => o, movie: (o) => `${o}/?video_id=${SAMPLE_MOVIE}&tmdb=1`, tv: (o) => `${o}/?video_id=${SAMPLE_TV}&tmdb=1&s=${SAMPLE_SEASON}&e=${SAMPLE_EPISODE}` },
];

async function fetchText(url: string, timeout: number): Promise<{ ok: boolean; status: number; text: string } | null> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(tid);
    const text = await response.text();
    return { ok: response.status >= 200 && response.status < 400, status: response.status, text };
  } catch {
    clearTimeout(tid);
    return null;
  }
}

function scoreBody(text: string): { score: number; evidence: string[] } {
  const lower = text.toLowerCase();
  if (CHALLENGE_MARKERS.some(m => lower.includes(m))) return { score: 0, evidence: ['challenge'] };
  if (lower.trim().length < MIN_CONTENT_LENGTH) return { score: 0, evidence: ['shell'] };

  let score = 0;
  const evidence: string[] = [];
  if (text.length >= 20000) score += 2;
  else if (text.length >= 2000) score += 1;
  for (const m of MARKERS) {
    if (m.re.test(text)) {
      score += m.score;
      evidence.push(m.re.source);
    }
  }
  return { score, evidence };
}

function normalizeBase(raw: string): string | null {
  try {
    const u = new URL(raw);
    let path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return null;
  }
}

async function reachable(base: string): Promise<Diagnostics> {
  const diag: Diagnostics = { url: base, status: 'offline', statusCode: 0, contentLength: 0, score: 0 };
  const res = await fetchText(base, REACH_TIMEOUT);
  if (!res) return diag;
  diag.statusCode = res.status;
  if (res.ok) {
    diag.contentLength = res.text.length;
    const { score, evidence } = scoreBody(res.text);
    diag.score = score;
    diag.evidence = evidence;
    diag.status = 'online';
  }
  return diag;
}

/** Probe one candidate: find the best-matching format (or null). */
async function probeFormats(base: string, origin: string, deadline: number): Promise<{ entry: ServerEntry | null; anyReachable: boolean; diag: Diagnostics }> {
  const diag: Diagnostics = { url: base, status: 'offline', statusCode: 0, contentLength: 0, score: 0 };

  let bestScore = 0;
  let bestEntry: ServerEntry | null = null;
  let anyReachable = false;

  for (const probe of PROBES) {
    if (Date.now() > deadline) break;

    for (const [kind, build] of [['movie', probe.movie], ['tv', probe.tv]] as const) {
      if (Date.now() > deadline) break;

      const url = build(base, origin);
      const res = await fetchText(url, PROBE_TIMEOUT);
      if (!res) continue;

      if (res.ok && !CHALLENGE_MARKERS.some(m => res.text.toLowerCase().includes(m))) anyReachable = true;

      const { score, evidence } = scoreBody(res.text);
      diag.statusCode = res.status;
      diag.contentLength = Math.max(diag.contentLength, res.text.length);
      if (score > diag.score) diag.score = score;
      if (score > 0) diag.evidence = evidence;
      if (score > 0 && (diag.status === 'offline')) diag.status = 'online';

      if (score > bestScore) {
        bestScore = score;
        if (score >= EVIDENCE_THRESHOLD) {
          bestEntry = { name: origin.replace(/^https?:\/\//, '').replace(/^www\./, ''), url: probe.urlFor(base, origin), format: probe.format };
        }
      }
      if (score >= STRONG_THRESHOLD) break; // early exit: strong player evidence
    }
    if (bestScore >= STRONG_THRESHOLD) break;
  }

  return { entry: bestEntry, anyReachable, diag };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = '';
  try {
    for await (const chunk of req) body += chunk;
  } catch {
    return res.status(400).json({ error: 'body_parse_failed' });
  }

  let extraCandidates: string[] = [];
  try {
    const parsed = JSON.parse(body || '{}');
    extraCandidates = Array.isArray(parsed.candidates) ? parsed.candidates.map(String) : [];
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const seen = new Set<string>();
  const seedOrigins = new Set(SEED.map(s => { try { return new URL(s.url).origin; } catch { return ''; } }));
  const candidates: { base: string; origin: string; isSeed: boolean; seedEntry?: ServerEntry }[] = [];

  const addCandidate = (raw: string, isSeed: boolean, seedEntry?: ServerEntry) => {
    const base = normalizeBase(raw);
    if (!base || seen.has(base)) return;
    seen.add(base);
    let origin: string;
    try { origin = new URL(base).origin; } catch { return; }
    if (!isSeed && seedOrigins.has(origin)) return;
    candidates.push({ base, origin, isSeed, seedEntry });
  };

  SEED.forEach(s => addCandidate(s.url, true, s));
  VIDSRC_TLDS.forEach(t => addCandidate(`https://vidsrc.${t}`, false));
  extraCandidates.forEach(c => addCandidate(c, false));

  const deadline = Date.now() + DEADLINE_MS;
  const servers: ServerEntry[] = [];
  const tested: Diagnostics[] = [];
  const seenUrls = new Set<string>();
  const MAX_SERVERS = 10;

  const addServer = (e: ServerEntry) => {
    if (seenUrls.has(e.url)) return;
    seenUrls.add(e.url);
    servers.push(e);
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length && Date.now() < deadline) {
      const c = candidates[cursor++];

      const pre = await reachable(c.base);
      if (pre.statusCode === 0 || Date.now() > deadline) {
        tested.push(pre);
        continue;
      }

      const { entry, anyReachable, diag } = await probeFormats(c.base, c.origin, deadline);
      diag.url = c.base;
      tested.push(diag);

      if (c.isSeed && c.seedEntry && anyReachable) {
        addServer({ ...c.seedEntry });
      } else if (entry) {
        addServer(entry);
        const found = tested.find(t => t.url === c.base);
        if (found) found.format = entry.format;
      }

      if (servers.length >= MAX_SERVERS) break;
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));

  res.json({
    servers,
    tested,
    updatedAt: new Date().toISOString(),
  });
}
