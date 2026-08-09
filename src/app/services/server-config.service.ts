import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ServerEntry {
  name: string;
  url: string;
  format: string;
}

export interface ServerConfig {
  servers: ServerEntry[];
  updatedAt?: string;
}

export type ServerHealth = 'checking' | 'online' | 'offline';

/**
 * Verified working providers (checked Aug 2026).
 * The old list contained many dead domains (embed.su, smashy, autoembed,
 * moviedata, vidbinge, moviesapi, gomo, rive, filmsss...) and providers whose
 * embed path was wrong (vidlink/superembed/cineby don't use `/embed/...`).
 */
export const DEFAULT_SERVERS: ServerEntry[] = [
  { name: 'Vidlink',            url: 'https://vidlink.pro',             format: 'vidlink' },
  { name: 'Multiembed',         url: 'https://multiembed.mov',          format: 'multiembed' },
  { name: 'SuperEmbed',         url: 'https://superembed.stream',       format: 'superembed' },
  { name: '2Embed',             url: 'https://2embed.cc/embed',         format: 'embed-direct' },
  { name: 'Cineby',             url: 'https://cineby.app',              format: 'cineby' },
  { name: 'Vidsrc.me (mirror)', url: 'https://vidsrcme.ru/embed',       format: 'standard' },
  { name: 'Vidsrc.nl',          url: 'https://vidsrc.nl',               format: 'standard' },
  { name: 'Vidsrc.sbs',         url: 'https://vidsrc.sbs/embed',        format: 'standard' },
];

const STATUS_CACHE_KEY = 'soulima_server_status_v2';
const RELIABILITY_KEY = 'soulima_server_reliability_v2';
const DISCOVERY_KEY = 'soulima_discovered_servers_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_THRESHOLD = 0.7;
const MIN_ATTEMPTS = 3;
const CHECK_CONCURRENCY = 4;

interface Reliability {
  [url: string]: { attempts: number; failures: number };
}

export interface DiscoverResult {
  servers: ServerEntry[];
  tested?: {
    url: string;
    status: string;
    statusCode: number;
    contentLength: number;
    score: number;
    evidence?: string[];
    format?: string;
  }[];
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ServerConfigService {
  private serversSubject = new BehaviorSubject<ServerEntry[]>(DEFAULT_SERVERS);
  private statusSubject = new BehaviorSubject<ServerHealth[]>(DEFAULT_SERVERS.map(() => 'checking'));
  private selectedIndexSubject = new BehaviorSubject<number>(0);
  private discoveringSubject = new BehaviorSubject<boolean>(false);
  private lastDiscoverySubject = new BehaviorSubject<string | null>(null);

  private servers: ServerEntry[] = DEFAULT_SERVERS;
  private status: ServerHealth[] = DEFAULT_SERVERS.map(() => 'checking');
  private triedServers = new Set<number>();
  private selectedIndex = 0;

  private fetchPromise: Promise<ServerEntry[]> | null = null;
  private initialized = false;

  servers$: Observable<ServerEntry[]> = this.serversSubject.asObservable();
  status$: Observable<ServerHealth[]> = this.statusSubject.asObservable();
  selectedIndex$: Observable<number> = this.selectedIndexSubject.asObservable();
  discovering$: Observable<boolean> = this.discoveringSubject.asObservable();
  lastDiscovery$: Observable<string | null> = this.lastDiscoverySubject.asObservable();

  constructor(private http: HttpClient) {}

  getServers(): ServerEntry[] {
    return this.servers;
  }

  getStatus(): ServerHealth[] {
    return this.status;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  isServerTried(index: number): boolean {
    return this.triedServers.has(index);
  }

  /** Load remote server list once, hydrate cache, then run availability checks. */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const local = this.loadDiscovered();
    const remote = await this.fetchRemoteServers();
    const base = local && local.length ? local : (remote && remote.length ? remote : DEFAULT_SERVERS);
    this.servers = base;
    this.status = base.map(() => 'checking');
    this.serversSubject.next(this.servers);
    this.statusSubject.next(this.status);

    const cached = this.loadStatusCache();
    if (cached && cached.length === this.servers.length) {
      this.status = cached;
      this.statusSubject.next(this.status);
      this.recheckInBackground();
    } else {
      this.checkAll();
    }

    this.maybeAutoDiscover();
  }

  /** Kick off background discovery only when the cached result is stale. */
  private maybeAutoDiscover(): void {
    if (this.isDiscoveryFresh()) return;
    this.discoverNow();
  }

  /** Re-probe the provider space; merge any newly working servers into the list. */
  async discoverNow(): Promise<void> {
    if (this.discoveringSubject.value) return;
    this.discoveringSubject.next(true);
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates: this.servers.map(s => s.url) }),
      });
      if (!res.ok) return;
      const result: DiscoverResult = await res.json();
      if (result.servers?.length) {
        this.applyDiscovered(result.servers);
      }
      this.lastDiscoverySubject.next(result.updatedAt || new Date().toISOString());
    } catch {
      // discovery must never break playback
    } finally {
      this.discoveringSubject.next(false);
    }
  }

  private applyDiscovered(discovered: ServerEntry[]): void {
    const seen = new Set<string>();
    const merged: ServerEntry[] = [];
    for (const s of [...discovered, ...this.servers]) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      merged.push(s);
    }

    const currentUrls = this.servers.map(s => s.url).sort().join(',');
    const mergedUrls = merged.map(s => s.url).sort().join(',');
    if (currentUrls === mergedUrls) {
      this.saveDiscovered(this.servers);
      return;
    }

    const prevUrl = this.servers[this.selectedIndex]?.url;
    this.servers = merged;
    this.status = merged.map(() => 'checking');
    this.triedServers.clear();
    this.serversSubject.next(this.servers);
    this.statusSubject.next(this.status);

    const idx = prevUrl ? merged.findIndex(s => s.url === prevUrl) : -1;
    this.selectedIndex = idx >= 0 ? idx : 0;
    this.selectedIndexSubject.next(this.selectedIndex);

    this.saveDiscovered(this.servers);
    this.checkAll();
  }

  /** Re-check every server (called when switching episode/title). */
  refresh(): void {
    this.triedServers.clear();

    const cached = this.loadStatusCache();
    if (cached && cached.length === this.servers.length) {
      this.status = cached;
      this.statusSubject.next([...this.status]);
      this.recheckInBackground();
      return;
    }

    this.checkAll();
  }

  select(index: number): void {
    if (index < 0 || index >= this.servers.length) return;
    this.selectedIndex = index;
    this.triedServers.add(index);
    this.selectedIndexSubject.next(index);
  }

  /** Build the embed URL for a server (replaces the per-component format switch). */
  buildEmbedUrl(index: number, mediaType: 'movie' | 'tv', id: number, season?: number, episode?: number): string {
    const server = this.servers[index];
    if (!server) return '';
    const isTv = mediaType === 'tv';

    switch (server.format) {
      case 'multiembed':
        return isTv
          ? `${server.url}/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`
          : `${server.url}/?video_id=${id}&tmdb=1`;
      case 'superembed':
        return isTv
          ? `${server.url}/?tmdb=1&id=${id}&s=${season}&e=${episode}`
          : `${server.url}/?tmdb=1&id=${id}`;
      case 'embed-direct':
        return isTv
          ? `${server.url}/${id}&s=${season}&e=${episode}`
          : `${server.url}/${id}`;
      case 'smashy':
        return isTv
          ? `${server.url}/tv/${id}?s=${season}&e=${episode}`
          : `${server.url}/movie/${id}`;
      case 'cineby':
      case 'vidlink':
      case 'standard':
      default:
        return isTv
          ? `${server.url}/tv/${id}/${season}/${episode}`
          : `${server.url}/movie/${id}`;
    }
  }

  /** Append a resume-time param to an already built embed URL. */
  withResumeTime(url: string, seconds: number): string {
    if (!url || seconds <= 5) return url;
    return `${url}${url.includes('?') ? '&' : '?'}t=${Math.floor(seconds)}`;
  }

  isChecking(): boolean {
    return this.status.includes('checking');
  }

  hasOnline(): boolean {
    return this.status.includes('online');
  }

  /** First untried server that is currently online, or -1. */
  firstOnlineUntried(): number {
    return this.status.findIndex((s, i) => s === 'online' && !this.triedServers.has(i));
  }

  /** Report a hard failure (user clicked "unavailable" or iframe error). */
  reportUnavailable(index: number): void {
    this.markOffline(index);

    const next = this.firstOnlineUntried();
    if (next !== -1) {
      this.select(next);
    } else {
      this.triedServers.clear();
      this.checkAll();
    }
  }

  /** Mark a server offline without auto-switching (used by heartbeat/iframe error). */
  markOffline(index: number): void {
    if (index < 0 || index >= this.status.length) return;
    this.status[index] = 'offline';
    this.statusSubject.next([...this.status]);
    this.updateReliability(index, false);
    this.saveStatusCache();
  }

  confirmPlayable(index: number): void {
    this.status[index] = 'online';
    this.statusSubject.next([...this.status]);
    this.updateReliability(index, true);
    this.saveStatusCache();
  }

  /** Direct HTTP reachability probe (still useful as a quick filter). */
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

  /* ────────────────────────── internals ────────────────────────── */

  private async fetchRemoteServers(): Promise<ServerEntry[]> {
    if (this.fetchPromise) return this.fetchPromise;
    this.fetchPromise = this.http.get<ServerConfig>('/api/servers')
      .toPromise()
      .then(config => (config?.servers?.length ? config.servers : DEFAULT_SERVERS))
      .catch(() => DEFAULT_SERVERS);
    return this.fetchPromise;
  }

  private checkAll(): void {
    this.status = this.servers.map(() => 'checking');
    this.statusSubject.next([...this.status]);

    const queue = this.getRankedQueue();
    if (queue.length === 0) {
      this.status = this.servers.map(() => 'offline');
      this.statusSubject.next([...this.status]);
      return;
    }

    let cursor = 0;
    const run = async () => {
      while (cursor < queue.length) {
        const { server, index } = queue[cursor++];
        const result = await this.checkServerStatus(server);
        this.status[index] = result;
        this.statusSubject.next([...this.status]);
        if (result === 'online') this.updateReliability(index, true);
        this.saveStatusCache();
      }
    };

    for (let i = 0; i < Math.min(CHECK_CONCURRENCY, queue.length); i++) {
      run();
    }
  }

  private recheckInBackground(): void {
    this.servers.forEach((server, i) => {
      this.checkServerStatus(server).then(status => {
        this.status[i] = status;
        this.statusSubject.next([...this.status]);
        if (status === 'online') this.updateReliability(i, true);
        this.saveStatusCache();
      });
    });
  }

  private getRankedQueue(): { server: ServerEntry; index: number }[] {
    const reliability = this.loadReliability();
    return this.servers
      .map((server, index) => ({ server, index }))
      .filter(({ index }) => !this.isUnreliable(index))
      .sort((a, b) => {
        const score = (i: number) => {
          const r = reliability[this.servers[i].url];
          return r ? (r.attempts - r.failures) / r.attempts : 0.5;
        };
        return score(b.index) - score(a.index);
      });
  }

  private isUnreliable(index: number): boolean {
    const r = this.loadReliability()[this.servers[index]?.url];
    if (!r || r.attempts < MIN_ATTEMPTS) return false;
    return r.failures / r.attempts > FAILURE_THRESHOLD;
  }

  private async checkServerStatus(server: ServerEntry): Promise<ServerHealth> {
    const checkUrl = this.buildCheckUrl(server);
    try {
      return await this.checkServer(checkUrl, 2500);
    } catch {
      return 'offline';
    }
  }

  private buildCheckUrl(server: ServerEntry): string {
    return server.url;
  }

  private updateReliability(index: number, success: boolean): void {
    const server = this.servers[index];
    if (!server) return;
    const data = this.loadReliability();
    const entry = data[server.url] || { attempts: 0, failures: 0 };
    entry.attempts++;
    if (!success) entry.failures++;
    data[server.url] = entry;
    try {
      localStorage.setItem(RELIABILITY_KEY, JSON.stringify(data));
    } catch {}
  }

  private loadReliability(): Reliability {
    try {
      const raw = localStorage.getItem(RELIABILITY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private loadStatusCache(): ServerHealth[] | null {
    try {
      const raw = localStorage.getItem(STATUS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          return parsed.status;
        }
      }
    } catch {}
    return null;
  }

  private saveStatusCache(): void {
    try {
      localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({
        status: this.status,
        timestamp: Date.now(),
      }));
    } catch {}
  }

  private isDiscoveryFresh(): boolean {
    try {
      const parsed = JSON.parse(localStorage.getItem(DISCOVERY_KEY) || 'null');
      return !!(parsed?.timestamp && Date.now() - parsed.timestamp < DISCOVERY_TTL_MS);
    } catch {
      return false;
    }
  }

  private loadDiscovered(): ServerEntry[] | null {
    try {
      const parsed = JSON.parse(localStorage.getItem(DISCOVERY_KEY) || 'null');
      if (parsed?.timestamp && Date.now() - parsed.timestamp < DISCOVERY_TTL_MS && Array.isArray(parsed.servers) && parsed.servers.length) {
        return parsed.servers;
      }
    } catch {}
    return null;
  }

  private saveDiscovered(servers: ServerEntry[]): void {
    try {
      localStorage.setItem(DISCOVERY_KEY, JSON.stringify({ servers, timestamp: Date.now() }));
    } catch {}
  }
}
