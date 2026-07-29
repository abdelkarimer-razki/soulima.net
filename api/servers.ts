export default function handler(_req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  res.json({
    servers: [
      { name: 'Server 1 (Vidsrc.to)',     url: 'https://vidsrc.to/embed',                 format: 'standard' },
      { name: 'Server 2 (Vidlink.pro)',   url: 'https://vidlink.pro',                     format: 'standard' },
      { name: 'Server 3 (Embed.su)',      url: 'https://embed.su/embed',                  format: 'standard' },
      { name: 'Server 4 (SmashyStream)',  url: 'https://player.smashy.stream',            format: 'smashy' },
      { name: 'Server 5 (Multiembed)',    url: 'https://multiembed.mov',                  format: 'multiembed' },
      { name: 'Server 6 (Autoembed)',     url: 'https://autoembed.cc/embed',              format: 'standard' },
      { name: 'Server 7 (2embed.cc)',     url: 'https://2embed.cc/embed',                 format: 'standard' },
      { name: 'Server 8 (Vidsrc.pro)',    url: 'https://vidsrc.pro/embed',                format: 'standard' },
      { name: 'Server 9 (Vidsrc.me)',     url: 'https://vidsrc.me/embed',                 format: 'standard' },
      { name: 'Server 10 (Moviedata)',    url: 'https://moviedata.info/embed',            format: 'standard' },
      { name: 'Server 11 (Vidbinge)',     url: 'https://vidbinge.dev/embed',              format: 'standard' },
      { name: 'Server 12 (SuperEmbed)',   url: 'https://superembed.stream',               format: 'standard' },
      { name: 'Server 13 (MoviesAPI)',    url: 'https://moviesapi.club',                  format: 'standard' },
      { name: 'Server 14 (Cineby)',       url: 'https://cineby.app',                      format: 'standard' },
      { name: 'Server 15 (Gomoplayer)',   url: 'https://gomo.to',                        format: 'standard' },
      { name: 'Server 16 (Rive)',         url: 'https://rive.zone',                       format: 'standard' },
      { name: 'Server 17 (Moviesapi.net)', url: 'https://moviesapi.net',                  format: 'standard' },
      { name: 'Server 18 (Vidflix)',      url: 'https://vidflix.net',                     format: 'standard' },
      { name: 'Server 19 (Filmsss)',      url: 'https://filmsss.com',                     format: 'standard' },
      { name: 'Server 20 (Cinezone)',     url: 'https://cinezone.net',                    format: 'standard' },
    ],
    updatedAt: new Date().toISOString()
  });
}
