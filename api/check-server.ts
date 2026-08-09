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

    const statusCode = response.status;
    const text = await response.text();
    const bodyLower = text.toLowerCase();

    const challenged = CHALLENGE_MARKERS.some(marker => bodyLower.includes(marker));
    const emptyShell = bodyLower.trim().length < MIN_CONTENT_LENGTH;
    const reached = statusCode >= 200 && statusCode < 400;

    const online = reached && !challenged && !emptyShell;

    res.json({
      status: online ? 'online' : 'offline',
      statusCode,
      contentLength: bodyLower.length,
      challenged,
      emptyShell,
    });
  } catch (err: any) {
    clearTimeout(tid);
    res.json({
      status: 'offline',
      keyword: err.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      statusCode: 0,
      contentLength: 0,
      challenged: false,
      emptyShell: true,
    });
  }
}
