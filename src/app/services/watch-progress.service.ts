import { Injectable } from '@angular/core';

export interface WatchProgress {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  seasonnb: number;
  episodenb: number;
  current_still_path: string | null;
  progress: number;
  updated_at: number;
}

@Injectable({ providedIn: 'root' })
export class WatchProgressService {
  private readonly STORAGE_KEY = 'series';

  getHistory(): WatchProgress[] {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  get(seriesId: number): WatchProgress | undefined {
    return this.getHistory().find(s => Number(s.id) === Number(seriesId));
  }

  save(entry: Partial<WatchProgress> & { id: number; name: string }) {
    const list = this.getHistory().filter(s => Number(s.id) !== Number(entry.id));
    list.unshift({
      id: entry.id,
      name: entry.name,
      poster_path: entry.poster_path ?? null,
      backdrop_path: entry.backdrop_path ?? null,
      seasonnb: entry.seasonnb ?? 1,
      episodenb: entry.episodenb ?? 1,
      current_still_path: entry.current_still_path ?? null,
      progress: entry.progress ?? 0,
      updated_at: entry.updated_at ?? Date.now(),
    });
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
  }

  replaceAll(entries: Partial<WatchProgress>[]): void {
    const items = entries.slice(0, 20).map(e => ({
      id: e.id!,
      name: e.name || '',
      poster_path: e.poster_path ?? null,
      backdrop_path: e.backdrop_path ?? null,
      seasonnb: e.seasonnb ?? 1,
      episodenb: e.episodenb ?? 1,
      current_still_path: e.current_still_path ?? null,
      progress: e.progress ?? 0,
      updated_at: e.updated_at ?? Date.now(),
    }));
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
  }

  formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  progressPercent(seconds: number, totalMinutes: number = 45): number {
    return Math.min(100, (seconds / (totalMinutes * 60)) * 100);
  }
}
