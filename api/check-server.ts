const ERROR_KEYWORDS = [
  'unavailable', 'not found', 'no longer available', 'removed',
  'media unavailable', 'content unavailable', 'error', 'failed to load',
  '404', 'not supported', 'try another server', 'no stream',
  'no video', 'we are unable', 'this video is', 'blocked',
  'access denied', 'forbidden', 'try again later',
];

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  let body = '';
  try {
    for await (const chunk of req) body += chunk;
  } catch {
    return res.status(400).json({ error: 'body_parse_failed' });
  }

  let url: string;
  let timeout = 4000;

  try {
    const parsed = JSON.parse(body);
    url = parsed.url;
    timeout = parsed.timeout || 2500;
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  if (!url) {
    return res.status(400).json({ error: 'url required' });
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });
    clearTimeout(tid);

    const text = await response.text();
    const bodyLower = text.toLowerCase();

    const found = ERROR_KEYWORDS.find(kw => bodyLower.includes(kw));

    res.json({
      status: found ? 'offline' : 'online',
      keyword: found || null,
      statusCode: response.status,
      contentLength: bodyLower.length,
    });
  } catch (err: any) {
    clearTimeout(tid);
    res.json({
      status: 'offline',
      keyword: err.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      statusCode: 0,
      contentLength: 0,
    });
  }
}
