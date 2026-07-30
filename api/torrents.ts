const TMDB_API_KEY = 'acc5f02e54fa612710d3245f53f29600';

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://open.dstud.io:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
];

function magnetLink(hash: string, name: string): string {
  const params = new URLSearchParams();
  params.set('xt', `urn:btih:${hash}`);
  params.set('dn', name);
  TRACKERS.forEach(tr => params.append('tr', tr));
  return `magnet:?${params.toString()}`;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const tmdbId = req.query.tmdb_id;
  const mediaType = req.query.media_type || 'movie';
  const season = req.query.season;
  const episode = req.query.episode;

  if (!tmdbId) return res.status(400).json({ error: 'tmdb_id required' });

  try {
    let imdbId: string | null = null;

    if (mediaType === 'tv') {
      const extRes = await fetch(
        `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
      );
      const extData = await extRes.json();
      imdbId = extData.imdb_id || null;
    } else {
      const extRes = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
      );
      const extData = await extRes.json();
      imdbId = extData.imdb_id || null;
    }

    const sources: Array<{ quality: string; magnet: string; size?: string }> = [];

    if (mediaType === 'movie' && imdbId) {
      const id = imdbId.replace('tt', '');
      const ytsRes = await fetch(
        `https://yts.gg/api/v2/movie_details.json?imdb_id=${id}`
      );
      const ytsData = await ytsRes.json();
      if (ytsData.data?.movie?.torrents) {
        for (const t of ytsData.data.movie.torrents) {
          if (t.hash) {
            sources.push({
              quality: `${t.quality} ${t.type || ''}`.trim(),
              magnet: magnetLink(t.hash, `${ytsData.data.movie.title} ${t.quality}`),
              size: t.size || undefined,
            });
          }
        }
      }
    }

    if (mediaType === 'tv' && imdbId) {
      const epRes = await fetch(
        `https://eztvx.to/api/get-torrents?imdb_id=${imdbId}&limit=50`
      );
      const epData = await epRes.json();
      if (epData.torrents) {
        const filtered = season && episode
          ? epData.torrents.filter((t: any) =>
              t.season === parseInt(season) && t.episode === parseInt(episode)
            )
          : epData.torrents;
        for (const t of filtered.slice(0, 10)) {
          if (t.magnet_url) {
            sources.push({
              quality: `${t.resolution || 'SD'} S${t.season}E${t.episode}`,
              magnet: t.magnet_url,
              size: t.size || undefined,
            });
          }
        }
      }
    }

    return res.json({ sources, imdb_id: imdbId });
  } catch (err: any) {
    return res.status(502).json({ error: err.message });
  }
}
