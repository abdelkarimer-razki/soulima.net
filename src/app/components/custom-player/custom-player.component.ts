import {
  Component, Input, Output, EventEmitter,
  OnInit, OnDestroy, OnChanges, ViewChild, ElementRef
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { WebtorrentService, TorrentProgress } from '../../services/webtorrent.service';
import { Subscription } from 'rxjs';

export interface PlayerSource {
  type: 'iframe' | 'torrent';
  url?: string;
  magnet?: string;
}

@Component({
  selector: 'app-custom-player',
  templateUrl: './custom-player.component.html',
  styleUrls: ['./custom-player.component.css']
})
export class CustomPlayerComponent implements OnInit, OnDestroy, OnChanges {
  @Input() iframeSrc?: SafeResourceUrl;
  @Input() iframeOriginalUrl?: string;
  @Input() torrentMagnet?: string;
  @Input() title: string = 'Video Player';
  @Output() allServersFailed = new EventEmitter<void>();
  @Output() iframeError = new EventEmitter<void>();

  private readonly noSandboxHosts = ['vidfast.pro', 'vidlink.pro', 'embed.su'];

  get iframeSandbox(): string | null {
    const sandbox = 'allow-scripts allow-same-origin allow-popups allow-presentation allow-forms';
    if (!this.iframeOriginalUrl) return sandbox;
    try {
      const hostname = new URL(this.iframeOriginalUrl).hostname.toLowerCase();
      const needsNoSandbox = this.noSandboxHosts.some(
        (h) => hostname === h || hostname.endsWith('.' + h)
      );
      return needsNoSandbox ? null : sandbox;
    } catch {
      return sandbox;
    }
  }

  @ViewChild('videoElement') videoEl!: ElementRef<HTMLVideoElement>;

  activeTab: 'server' | 'torrent' = 'server';
  torrentStarted = false;
  torrentStreamUrl?: SafeResourceUrl;
  torrentProgress: TorrentProgress | null = null;
  torrentError: string | null = null;
  torrentLoading = false;
  useCloudFallback = false;
  private torrentSub?: Subscription;

  constructor(
    private sanitizer: DomSanitizer,
    private webtorrentService: WebtorrentService
  ) {}

  ngOnChanges(changes: any): void {
    if (changes.torrentMagnet && !changes.torrentMagnet.firstChange) {
      const newMagnet = changes.torrentMagnet.currentValue;
      if (newMagnet) {
        if (this.activeTab === 'torrent' && this.torrentStarted) {
          this.switchToTorrent();
        }
      } else {
        this.switchToServer();
      }
    }
    if (changes.iframeSrc && !changes.iframeSrc.firstChange) {
      this.switchToServer();
    }
  }

  ngOnInit(): void {
    if (this.iframeSrc) {
      this.activeTab = 'server';
    } else if (this.torrentMagnet) {
      this.activeTab = 'torrent';
    }
  }

  ngOnDestroy(): void {
    this.stopTorrentStream();
    this.torrentStreamUrl = undefined;
  }

  switchToServer(): void {
    this.activeTab = 'server';
    this.stopTorrentStream();
  }

  switchToTorrent(): void {
    if (!this.torrentMagnet) return;
    this.activeTab = 'torrent';
    this.torrentStarted = true;
    this.useCloudFallback = false;
    this.startWebTorrent();
  }

  private startWebTorrent(): void {
    this.torrentLoading = true;
    this.torrentError = null;
    this.torrentProgress = null;

    setTimeout(() => {
      if (!this.videoEl?.nativeElement) {
        this.fallbackToCloud();
        return;
      }

      this.torrentSub = this.webtorrentService
        .streamToVideoElement(this.torrentMagnet!, this.videoEl.nativeElement)
        .subscribe({
          next: (progress) => {
            this.torrentProgress = progress;
            if (progress.status === 'playing') {
              this.torrentLoading = false;
            }
          },
          error: (err) => {
            this.torrentLoading = false;
            this.torrentError = err?.error || 'Failed to start torrent stream';
          },
          complete: () => {
            this.torrentLoading = false;
          }
        });
    });
  }

  fallbackToCloud(): void {
    this.useCloudFallback = true;
    const url = `https://webtor.io/show?magnet=${encodeURIComponent(this.torrentMagnet || '')}`;
    this.torrentStreamUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  retryTorrent(): void {
    this.stopTorrentStream();
    this.startWebTorrent();
  }

  private stopTorrentStream(): void {
    if (this.torrentSub) {
      this.torrentSub.unsubscribe();
      this.torrentSub = undefined;
    }
    if (this.torrentMagnet) {
      this.webtorrentService.stopTorrent(this.torrentMagnet);
    }
    this.torrentProgress = null;
    this.torrentError = null;
    this.torrentLoading = false;
    this.torrentStarted = false;
    this.torrentStreamUrl = undefined;
    this.useCloudFallback = false;
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
