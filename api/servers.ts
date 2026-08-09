export default function handler(_req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  res.json({
    servers: [
      { name: 'Vidlink',            url: 'https://vidlink.pro',             format: 'vidlink' },
      { name: 'Multiembed',         url: 'https://multiembed.mov',          format: 'multiembed' },
      { name: 'SuperEmbed',         url: 'https://superembed.stream',       format: 'superembed' },
      { name: '2Embed',             url: 'https://2embed.cc/embed',         format: 'embed-direct' },
      { name: 'Cineby',             url: 'https://cineby.app',              format: 'cineby' },
      { name: 'Vidsrc.me (mirror)', url: 'https://vidsrcme.ru/embed',       format: 'standard' },
      { name: 'Vidsrc.nl',          url: 'https://vidsrc.nl',               format: 'standard' },
    ],
    updatedAt: new Date().toISOString()
  });
}
