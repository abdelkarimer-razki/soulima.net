import { Component, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, ElementRef, NgZone } from '@angular/core';
import { TorrentService, TorrentSource } from '../../services/torrent.service';
import { DownloadService } from '../../services/download.service';

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

  downloaded = 0;
  total = 0;
  progress = 0;
  speed = 0;
  peers = 0;
  ready = false;

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  showControls = true;
  private controlsTimeout: any = null;
  private progressSub: any = null;
  private timeUpdateHandler: (() => void) | null = null;

  constructor(
    private torrentService: TorrentService,
    private downloadService: DownloadService,
    private zone: NgZone
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
    this.startTorrent();
  }

  startTorrent() {
    if (!this.selectedSource) return;
    this.stopTorrent();
    this.loading = true;
    this.error = null;
    this.ready = false;

    const existingVideo = this.videoRef?.nativeElement;
    if (existingVideo) {
      existingVideo.src = '';
      existingVideo.load();
    }

    const video = this.torrentService.play(this.selectedSource.magnet);
    if (!video) {
      this.error = 'WebTorrent is not available.';
      this.loading = false;
      return;
    }

    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';

    const container = this.videoRef?.nativeElement?.parentElement;
    if (container) {
      container.innerHTML = '';
      container.appendChild(video);
    }

    video.addEventListener('canplay', () => {
      this.zone.run(() => {
        this.loading = false;
        this.ready = true;
        video.play().catch(() => {});
      });
    });

    video.addEventListener('play', () => this.zone.run(() => this.isPlaying = true));
    video.addEventListener('pause', () => this.zone.run(() => this.isPlaying = false));
    video.addEventListener('timeupdate', () => {
      this.zone.run(() => {
        this.currentTime = video.currentTime;
        this.duration = video.duration || 0;
      });
    });
    video.addEventListener('error', () => {
      this.zone.run(() => {
        this.error = 'Video playback error.';
        this.loading = false;
      });
    });

    this.timeUpdateHandler = () => {};

    this.progressSub = this.torrentService.progress$.subscribe(p => {
      this.zone.run(() => {
        this.downloaded = p.downloaded;
        this.total = p.total;
        this.progress = p.progress;
        this.speed = p.speed;
        this.peers = p.peers;
        this.ready = this.ready || p.ready;
        this.loading = this.loading && !p.ready;
        if (p.error) {
          this.error = p.error;
          this.loading = false;
        }
      });
    });
  }

  private stopTorrent() {
    this.torrentService.stop();
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

  download() {
    if (this.selectedSource?.magnet) {
      window.open(this.selectedSource.magnet, '_blank');
    }
  }

  ngOnDestroy() {
    this.stopTorrent();
    this.torrentService.destroy();
  }
}
