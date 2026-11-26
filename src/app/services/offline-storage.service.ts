import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface OfflineMediaItem {
  id: string; // e.g. 'movie_12345' or 'tv_12345_1_1' or 'local_1690000000'
  mediaId?: number;
  title: string;
  mediaType: 'movie' | 'tv' | 'local';
  season?: number;
  episode?: number;
  posterUrl?: string;
  backdropUrl?: string;
  // Blob-backed items (web IndexedDB). Desktop items instead carry streamUrl +
  // mediaId pointing at the on-disk media library served by the PC app.
  videoBlob?: Blob;
  subtitleBlob?: Blob;
  subtitleName?: string;
  streamUrl?: string;
  mediaIdServer?: string;
  fileSize: number;
  mimeType: string;
  downloadDate: string;
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineStorageService {
  private dbName = 'SoulimaOfflineDB';
  private dbVersion = 1;
  private storeName = 'offline_media';
  private dbPromise: Promise<IDBDatabase> | null = null;

  private isOfflineSubject = new BehaviorSubject<boolean>(!navigator.onLine);
  isOffline$: Observable<boolean> = this.isOfflineSubject.asObservable();

  private itemsSubject = new BehaviorSubject<OfflineMediaItem[]>([]);
  items$: Observable<OfflineMediaItem[]> = this.itemsSubject.asObservable();

  constructor() {
    this.initNetworkListener();
    this.refreshItems();
  }

  private initNetworkListener(): void {
    window.addEventListener('online', () => this.isOfflineSubject.next(false));
    window.addEventListener('offline', () => this.isOfflineSubject.next(true));
  }

  public get isOffline(): boolean {
    return !navigator.onLine;
  }

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('mediaType', 'mediaType', { unique: false });
          store.createIndex('downloadDate', 'downloadDate', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async saveMedia(item: OfflineMediaItem): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.put(item);
      req.onsuccess = () => {
        this.refreshItems();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllMedia(): Promise<OfflineMediaItem[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // Fetch only metadata (omitting multi-gigabyte video blobs from memory for list views)
  async getAllMediaMetadata(): Promise<OfflineMediaItem[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.openCursor();
      const items: OfflineMediaItem[] = [];

      req.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const val = cursor.value;
          const { videoBlob, subtitleBlob, ...metadata } = val;
          items.push(metadata as OfflineMediaItem);
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getMediaById(id: string): Promise<OfflineMediaItem | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteMedia(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.delete(id);
      req.onsuccess = () => {
        this.refreshItems();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async isMediaDownloaded(id: string): Promise<boolean> {
    const item = await this.getMediaById(id);
    return item !== null;
  }

  async refreshItems(): Promise<void> {
    try {
      const items = await this.getAllMediaMetadata();
      this.itemsSubject.next(items);
    } catch {
      this.itemsSubject.next([]);
    }
  }

  async getStorageEstimate(): Promise<{ used: number; quota: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { used: 0, quota: 0 };
  }

  createBlobUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
  }

  revokeBlobUrl(url: string): void {
    URL.revokeObjectURL(url);
  }
}
