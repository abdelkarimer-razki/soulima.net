import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { OfflineStorageService, OfflineMediaItem } from '../services/offline-storage.service';
import { TorrentService } from '../services/torrent.service';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-offline-player',
  templateUrl: './offline-player.component.html',
  styleUrls: ['./offline-player.component.css']
})
export class OfflinePlayerComponent implements OnInit, OnDestroy {
  loading = true;
  error: string | null = null;

  videoUrl: string | null = null;
  subtitleUrl: string | null = null;
  subtitleName: string | null = null;

  title = '';
  info = '';
  posterUrl = '';
  backdropUrl = '';
  knownDuration = 0;

  private blobUrl: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private offlineStorage: OfflineStorageService,
    private torrentService: TorrentService,
    private seoService: SeoService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') || '';
    let item: OfflineMediaItem | null = null;
    try {
      item = await this.resolveItem(id);
    } catch (e) {
      console.warn('Could not load offline item:', e);
    }

    if (!item) {
      this.error = 'This download is no longer available on this device.';
      this.loading = false;
      return;
    }

    // Desktop items are served as (fragmented) remuxed MP4 whose total runtime
    // the browser only learns progressively. Ask the server for the exact
    // duration so the HUD shows the full length right away.
    if (item.streamUrl && !item.duration && item.mediaIdServer) {
      try {
        const meta = await this.torrentService.getMediaMeta(item.mediaIdServer);
        if (meta && meta.duration > 0) item.duration = meta.duration;
      } catch (e) {
        console.warn('Could not fetch media duration:', e);
      }
    }

    if (item.streamUrl) {
      this.videoUrl = item.streamUrl;
    } else if (item.videoBlob) {
      this.blobUrl = this.offlineStorage.createBlobUrl(item.videoBlob);
      this.videoUrl = this.blobUrl;
    }

    this.title = item.title;
    this.info = this.buildInfo(item);
    this.posterUrl = item.posterUrl || '';
    this.backdropUrl = item.backdropUrl || '';
    this.knownDuration = item.duration || 0;
    this.loading = false;

    this.seoService.updateMeta({
      title: `${item.title} | My Downloads | Soulima`,
      description: `Play your downloaded ${item.mediaType === 'tv' ? 'TV show' : 'movie'} offline, anytime.`
    });
  }

  private async resolveItem(id: string): Promise<OfflineMediaItem | null> {
    if (id.startsWith('disk_')) {
      // Desktop app: on-disk media library (MEDIA_DIR) served by the PC app.
      const serverId = id.slice('disk_'.length);
      const data = await this.torrentService.getMediaLibrary();
      const r = (data?.items || []).find((i: any) => i.id === serverId);
      if (!r) return null;
      return {
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
      };
    }
    return this.offlineStorage.getMediaById(id);
  }

  private buildInfo(item: OfflineMediaItem): string {
    if (item.mediaType === 'tv' && item.season && item.episode) {
      return `S${item.season} • E${item.episode}`;
    }
    return item.mediaType === 'movie' ? 'Movie' : '';
  }

  onSubtitleSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (this.subtitleUrl) URL.revokeObjectURL(this.subtitleUrl);
    this.subtitleUrl = URL.createObjectURL(file);
    this.subtitleName = file.name;
    input.value = '';
  }

  ngOnDestroy(): void {
    if (this.blobUrl) {
      this.offlineStorage.revokeBlobUrl(this.blobUrl);
      this.blobUrl = null;
    }
    if (this.subtitleUrl) {
      URL.revokeObjectURL(this.subtitleUrl);
      this.subtitleUrl = null;
    }
  }
}
