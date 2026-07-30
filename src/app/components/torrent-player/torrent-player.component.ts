import { Component, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import { TorrentService, TorrentSource } from '../../services/torrent.service';

@Component({
  selector: 'app-torrent-player',
  templateUrl: './torrent-player.component.html',
  styleUrls: ['./torrent-player.component.css']
})
export class TorrentPlayerComponent implements OnChanges, OnDestroy {
  @Input() sources: TorrentSource[] = [];
  @Input() title: string = '';

  @ViewChild('videoPlayer') videoRef!: ElementRef<HTMLVideoElement>;

  selectedSource: TorrentSource | null = null;
  loading = false;
  error: string | null = null;

  progress = 0;
  speed = 0;
  peers = 0;
  downloaded = 0;
  total = 0;
  ready = false;

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  showControls = true;

  private currentStreamId: string | null = null;
  private controlsTimeout: any = null;
  private progressSub: any = null;

  constructor(
    private torrentService: TorrentService,
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['sources'] && this.sources?.length) {
      const best = this.sources.find(s => s.quality.startsWith('1080p')) || this.sources[0];
      if (!this.selectedSource || !this.sources.includes(this.selectedSource)) {
        this.selectedSource = best;
      }
    }
  }

  selectSource(source: TorrentSource) {
    this.selectedSource = source;
    this.startStream();
  }

  async startStream() {
    if (!this.selectedSource) return;
    this.stopStream();
    this.loading = true;
    this.error = null;
    this.ready = false;

    const video = this.videoRef?.nativeElement;
    if (video) {
      video.src = '';
      video.load();
    }

    try {
      const info = await this.torrentService.requestStream(this.selectedSource.magnet);
      this.currentStreamId = info.id;
      this.total = info.size;

      this.torrentService.startPolling(info.id);

      this.progressSub = this.torrentService.progress$.subscribe(p => {
        this.progress = p.progress;
        this.speed = p.speed;
        this.peers = p.peers;
        this.downloaded = p.downloaded;
        this.ready = this.ready || p.ready;
        this.loading = this.loading && !p.ready;
        if (p.error) {
          this.error = p.error;
          this.loading = false;
        }
      });

      if (video && info.streamUrl) {
        video.src = info.streamUrl;
        video.load();
      }
    } catch (err: any) {
      this.error = err.message || 'Failed to start stream';
      this.loading = false;
    }
  }

  private stopStream() {
    if (this.currentStreamId) {
      this.torrentService.stopStream(this.currentStreamId);
      this.currentStreamId = null;
    }
    if (this.progressSub) {
      this.progressSub.unsubscribe();
      this.progressSub = null;
    }
  }

  togglePlay() {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    if (video.paused) video.play().catch(() => {}); else video.pause();
  }

  onPlayerMouseMove() {
    this.showControls = true;
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
    this.controlsTimeout = setTimeout(() => this.showControls = false, 3000);
  }

  formatTime(s: number): string {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  formatSpeed(bytes: number): string {
    if (!bytes) return '0 B/s';
    const u = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${u[i]}`;
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${u[i]}`;
  }

  download() {
    if (this.selectedSource?.magnet) {
      window.open(this.selectedSource.magnet, '_blank');
    }
  }

  ngOnDestroy() {
    this.stopStream();
  }
}
