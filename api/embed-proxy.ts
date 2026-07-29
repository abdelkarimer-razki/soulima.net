const AD_PATTERNS = [
  /<script[^>]*src=["'][^"']*doubleclick\.net[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*googlesyndication\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*googleadservices\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*google-analytics\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*googletagmanager\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*popads\.net[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*popcash\.net[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*exoclick\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*adsterra\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*propellerads\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*trafficjunky\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*adcash\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*ad1game\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*platform\.twitter\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*cdn\.engine[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*cdn\.ad[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*src=["'][^"']*\/\/pagead2\.googlesyndication\.com[^"']*["'][^>]*><\/script>/gi,
  /<script[^>]*>[^<]*(?:google_ad_client|google_ad_slot|google_ad_width|google_ad_height|adblock|popunder|popup)[^<]*<\/script>/gi,
  /<iframe[^>]*src=["'][^"']*doubleclick\.net[^"']*["'][^>]*><\/iframe>/gi,
  /<iframe[^>]*src=["'][^"']*googlesyndication\.com[^"']*["'][^>]*><\/iframe>/gi,
  /<iframe[^>]*src=["'][^"']*googleadservices\.com[^"']*["'][^>]*><\/iframe>/gi,
  /<iframe[^>]*src=["'][^"']*popads\.net[^"']*["'][^>]*><\/iframe>/gi,
  /<iframe[^>]*src=["'][^"']*exoclick\.com[^"']*["'][^>]*><\/iframe>/gi,
  /<iframe[^>]*src=["'][^"']*adsterra\.com[^"']*["'][^>]*><\/iframe>/gi,
  /<div[^>]*(?:class|id)=["'][^"']*(?:ad-?|advert|ads_?|banner_?|sponsor|popup|overlay-ad)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  /<ins[^>]*class=["'][^"']*adsbygoogle[^"']*["'][^>]*>[\s\S]*?<\/ins>/gi,
];

// Strip entire inline <script> blocks containing redirect or anti-iframe patterns
const SCRIPT_REDIRECT_PATTERNS = [
  /<script[^>]*>[\s\S]*?(?:location\.(?:href|replace|assign)\s*[=\(]|document\.location\s*=|window\.location\s*=|top\.location|parent\.location|self\.location)[\s\S]*?<\/script>/gi,
  /<script[^>]*>[\s\S]*?(?:document\.domain|location\.hostname|location\.host|location\.origin)[\s\S]*?(?:!==|!=|===|==|indexOf)[\s\S]*?<\/script>/gi,
  /<script[^>]*>[\s\S]*?(?:window\.top\s*!==\s*window|top\s*!==\s*self|self\s*!==\s*top|parent\s*!==\s*self|window\.parent\s*!==\s*window)[\s\S]*?<\/script>/gi,
  /<script[^>]*>[\s\S]*?\.href\s*=\s*["'][^"']*(?:https?:\/\/)[^"']*["'][\s\S]*?<\/script>/gi,
];

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const targetUrl = req.query?.url;
  if (!targetUrl) return res.status(400).json({ error: 'url query param required' });

  try { new URL(targetUrl); } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const origin = new URL(targetUrl).origin;

    let response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': origin + '/',
      },
      redirect: 'manual',
    });

    clearTimeout(timeout);

    // Handle redirects — only follow same-origin, block cross-origin redirects (anti-proxy)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('redirect with no location');
      const redirectHost = new URL(location, targetUrl).hostname;
      if (redirectHost !== new URL(targetUrl).hostname) {
        throw new Error('server redirects to different origin');
      }
      response = await fetch(location, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': origin + '/',
        },
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error('redirect chain');
      }
    }

    let html = await response.text();

    // Strip ads
    for (const p of AD_PATTERNS) html = html.replace(p, '');

    // Strip entire inline scripts that redirect or detect iframes
    for (const p of SCRIPT_REDIRECT_PATTERNS) html = html.replace(p, '');

    // Strip redirect lines from inline JS (as backup for missed script blocks)
    html = html.replace(/\.location\s*=\s*["'][^"']*["']\s*;?/gi, '/*sli*/');
    html = html.replace(/\.location\.href\s*=\s*["'][^"']*["']\s*;?/gi, '/*sli*/');
    html = html.replace(/\.location\.(replace|assign)\s*\([^)]+\)\s*;?/gi, '/*sli*/');

    // Strip redirect from HTML event attributes
    html = html.replace(/\s+on(load|error)\s*=\s*["'][^"']*location[^"']*["']/gi, '');

    // Inject base tag
    html = html.replace('<head>', `<head><base href="${origin}/">`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.status(200).send(html);
  } catch (err: any) {
    clearTimeout(timeout);
    const msg = err.name === 'AbortError' ? 'timeout' : 'fetch_failed';
    res.status(502).json({ error: msg, details: err.message });
  }
}
