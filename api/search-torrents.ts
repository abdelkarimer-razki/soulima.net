export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = '';
  for await (const chunk of req) body += chunk;
  const { type, title, year, imdbId, season, episode } = JSON.parse(body);

  if (type === 'movie') return res.json({ torrents: await searchMovie(title, year, imdbId) });
  if (type === 'tv') return res.json({ torrents: await searchTV(title, season, episode) });

  res.status(400).json({ error: 'invalid type' });
}

async function searchMovie(title: string, year?: number, imdbId?: string): Promise<any[]> {
  const trackers = trackerString();
  const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();

  // Try Apibay first with multiple query attempts
  try {
    const queries = [
      ...(imdbId ? [imdbId] : []),
      ...(year ? [`${cleanTitle} ${year}`] : []),
      cleanTitle,
    ];

    for (const q of queries) {
      const url = `https://apibay.org/q.php?q=${encodeURIComponent(q)}`;
      const res = await fetchWithTimeout(url, 5000);
      if (!res) continue;

      const data = await res.json();
      if (!Array.isArray(data) || !data.length || (data.length === 1 && data[0].id === '0')) continue;

      const results = data
        .filter((item: any) => item.info_hash && item.info_hash !== '0000000000000000000000000000000000000000')
        .map((item: any) => ({
          id: `apibay_${item.id}`,
          name: item.name,
          magnet: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}${trackers}`,
          quality: parseQuality(item.name),
          seeders: Number(item.seeders) || 0,
          leechers: Number(item.leechers) || 0,
          filesize: formatBytes(Number(item.size) || 0),
          type: 'movie' as const,
        }))
        .sort((a: any, b: any) => b.seeders - a.seeders);

      if (results.length) return results;
    }
  } catch {}

  // Fallback: try YTS in case it's accessible
  try {
    const queryTerm = imdbId || `${cleanTitle}${year ? ` ${year}` : ''}`;
    const ytsUrl = `https://yts.mx/api/v2/list.json?query_term=${encodeURIComponent(queryTerm)}&limit=5&sort_by=seeds`;
    const ytsRes = await fetchWithTimeout(ytsUrl, 4000);
    if (ytsRes?.ok) {
      const ytsData = await ytsRes.json();
      if (ytsData?.data?.movies?.length) {
        const torrents: any[] = [];
        for (const movie of ytsData.data.movies) {
          if (movie.torrents) {
            for (const t of movie.torrents) {
              torrents.push({
                id: `yts_${movie.id}_${t.hash}`,
                name: `${movie.title_english} (${t.quality})`,
                magnet: `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title_english)}${trackers}`,
                quality: t.quality,
                seeders: t.seeds,
                leechers: t.peers,
                filesize: t.size,
                type: 'movie',
              });
            }
          }
        }
        if (torrents.length) return torrents;
      }
    }
  } catch {}

  return [];
}

async function searchTV(title: string, season: number, episode: number): Promise<any[]> {
  const trackers = trackerString();
  const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const seasonStr = String(season).padStart(2, '0');
  const episodeStr = String(episode).padStart(2, '0');

  try {
    const queries = [
      `${cleanTitle} S${seasonStr}E${episodeStr}`,
      `${cleanTitle} ${season}x${episode}`,
      `${cleanTitle} Season ${season} Episode ${episode}`,
      cleanTitle,
    ];

    for (const q of queries) {
      const url = `https://apibay.org/q.php?q=${encodeURIComponent(q)}`;
      const res = await fetchWithTimeout(url, 5000);
      if (!res) continue;

      const data = await res.json();
      if (!Array.isArray(data) || !data.length || (data.length === 1 && data[0].id === '0')) continue;

      const results = data
        .filter((item: any) => item.info_hash && item.info_hash !== '0000000000000000000000000000000000000000')
        .map((item: any) => ({
          id: `apibay_${item.id}`,
          name: item.name,
          magnet: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}${trackers}`,
          quality: parseQuality(item.name),
          seeders: Number(item.seeders) || 0,
          leechers: Number(item.leechers) || 0,
          filesize: formatBytes(Number(item.size) || 0),
          type: 'tv' as const,
        }))
        .sort((a: any, b: any) => b.seeders - a.seeders);

      if (results.length) return results;
    }
  } catch {}

  return [];
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Soulima/1.0)' } });
    clearTimeout(id);
    return res;
  } catch {
    return null;
  }
}

function parseQuality(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k')) return '2160p';
  if (lower.includes('1080p')) return '1080p';
  if (lower.includes('720p')) return '720p';
  if (lower.includes('480p')) return '480p';
  return 'HD/SD';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function trackerString(): string {
  const trackers = [
    'udp://tracker.coppersurfer.tk:6969/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.files.fm:7073/announce',
    'wss://tracker.gbitt.info:443/announce',
    'wss://tracker.novage.com.ua:443/announce',
  ];
  return trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
}
