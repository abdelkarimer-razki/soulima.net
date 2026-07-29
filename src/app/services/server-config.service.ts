import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface ServerEntry {
  name: string;
  url: string;
  format: string;
}

export interface ServerConfig {
  servers: ServerEntry[];
  updatedAt?: string;
}

const HARDCODED_SERVERS: ServerEntry[] = [
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
];

@Injectable({ providedIn: 'root' })
export class ServerConfigService {
  private cachedServers: ServerEntry[] | null = null;
  private fetchPromise: Promise<ServerEntry[]> | null = null;

  constructor(private http: HttpClient) {}

  getServers(): Promise<ServerEntry[]> {
    if (this.cachedServers) return Promise.resolve(this.cachedServers);
    if (this.fetchPromise) return this.fetchPromise;

    this.fetchPromise = this.http.get<ServerConfig>('/api/servers')
      .toPromise()
      .then(config => {
        this.cachedServers = (config?.servers?.length ? config.servers : HARDCODED_SERVERS);
        return this.cachedServers;
      })
      .catch(() => {
        this.cachedServers = HARDCODED_SERVERS;
        return this.cachedServers;
      });

    return this.fetchPromise;
  }

  async checkServer(url: string, timeout = 2500): Promise<'online' | 'offline'> {
    try {
      const res = await fetch('/api/check-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, timeout }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'online') return 'online';
      }
    } catch {}

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeout);
    try {
      await fetch(url, { mode: 'no-cors', signal: controller.signal });
      clearTimeout(tid);
      return 'online';
    } catch {
      clearTimeout(tid);
      return 'offline';
    }
  }
}
