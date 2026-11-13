import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { OfflineStorageService, OfflineMediaItem } from '../services/offline-storage.service';
import { TorrentService } from '../services/torrent.service';
import { Subscription } from 'rxjs';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-offline-library',
  templateUrl: './offline-library.component.html',
  styleUrls: ['./offline-library.component.css']
})
export class OfflineLibraryComponent implements OnInit, OnDestroy {
  items: OfflineMediaItem[] = [];
  isOffline = false;
  storageUsedMB = '0';
  storageQuotaMB = '0';
  storagePercent = 0;

  searchQuery = '';

  private readonly isDesktop = document.documentElement.dataset['desktop'] === '1';
  private blobItems: OfflineMediaItem[] = [];
  private desktopItems: OfflineMediaItem[] = [];
  private subs = new Subscription();

  constructor(
    private offlineStorage: OfflineStorageService,
    private torrentService: TorrentService,
    private seoService: SeoService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.seoService.updateMeta({
      title: 'My Offline Downloads | Soulima',
      description: 'Access and play your downloaded movies, TV shows, and local videos offline anytime without internet connection.'
    });

    this.subs.add(
      this.offlineStorage.isOffline$.subscribe(offline => {
        this.isOffline = offline;
      })
    );

    this.subs.add(
      this.offlineStorage.items$.subscribe(items => {
        this.blobItems = items;
        this.renderItems();
      })
    );

    // Desktop app: also list the on-disk media library (MEDIA_DIR) so files
    // saved by the PC app appear here too, streamed straight from disk.
    if (this.isDesktop) {
      this.loadDesktopLibrary();
    }

    this.updateStorageInfo();
  }

  private async loadDesktopLibrary(): Promise<void> {
    try {
      const data = await this.torrentService.getMediaLibrary();
      const items = (data?.items || []).map((r: any): OfflineMediaItem => ({
        id: `disk_${r.id}`,
        title: (r.meta && (r.meta.title || r.meta.serverTitle)) || r.fileName || 'Downloaded Video',
        mediaType: r.meta?.mediaType === 'tv' ? 'tv' : r.meta?.mediaType === 'movie' ? 'movie' : 'local',
        season: r.meta?.season,
        episode: r.meta?.episode,
        posterUrl: r.meta?.posterUrl,
        backdropUrl: r.meta?.backdropUrl,
        streamUrl: this.torrentService.getMediaStreamUrl(r.id),
        mediaIdServer: r.id,
        duration: r.duration || 0,
        fileSize: r.fileSize,
        mimeType: r.mimeType,
        downloadDate: r.downloadDate,
      }));
      this.desktopItems = items;
      this.renderItems();
    } catch (e) {
      console.warn('Could not load desktop media library:', e);
    }
  }

  private renderItems(): void {
    this.items = [...this.desktopItems, ...this.blobItems];
    this.updateStorageInfo();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  searchSite(): void {
    const q = (this.searchQuery || '').trim();
    this.router.navigate(['/'], q ? { queryParams: { search: q } } : undefined);
  }

  async updateStorageInfo(): Promise<void> {
    const est = await this.offlineStorage.getStorageEstimate();
    const diskUsed = this.desktopItems.reduce((sum, i) => sum + (i.fileSize || 0), 0);
    const used = (est.used || 0) + diskUsed;
    const quota = (est.quota || 0) + diskUsed;

    this.storageUsedMB = (used / (1024 * 1024)).toFixed(1);
    this.storageQuotaMB = (quota / (1024 * 1024)).toFixed(0);
    this.storagePercent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  }

  playItem(item: OfflineMediaItem): void {
    this.router.navigate(['/downloads', item.id]);
  }

  async deleteItem(event: Event, item: OfflineMediaItem): Promise<void> {
    event.stopPropagation();
    if (confirm(`Remove "${item.title}" from offline downloads?`)) {
      if (item.mediaIdServer) {
        await this.torrentService.deleteMediaItem(item.mediaIdServer);
        this.desktopItems = this.desktopItems.filter(i => i.id !== item.id);
        this.renderItems();
      } else {
        await this.offlineStorage.deleteMedia(item.id);
      }
    }
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const newItem: OfflineMediaItem = {
      id: `local_${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ''),
      mediaType: 'local',
      videoBlob: file,
      fileSize: file.size,
      mimeType: file.type || 'video/mp4',
      downloadDate: new Date().toISOString()
    };

    this.offlineStorage.saveMedia(newItem).then(() => {
      this.playItem(newItem);
    });

  }
}
