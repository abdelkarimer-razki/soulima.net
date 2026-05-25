import {
  Component, Input, Output, EventEmitter,
  OnInit, OnDestroy, OnChanges
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

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
  @Input() torrentMagnet?: string;
  @Input() title: string = 'Video Player';

  activeTab: 'server' | 'torrent' = 'server';
  torrentStarted = false;
  torrentStreamUrl?: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {}

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
    this.torrentStreamUrl = undefined;
  }

  /** Switch to server/iframe mode */
  switchToServer(): void {
    this.activeTab = 'server';
    this.torrentStarted = false;
    this.torrentStreamUrl = undefined;
  }

  /** Switch to torrent mode and start streaming */
  switchToTorrent(): void {
    if (!this.torrentMagnet) {
      console.error('No torrent magnet available');
      return;
    }

    this.activeTab = 'torrent';
    this.torrentStarted = true;
    
    // Build and sanitize the Webtor.io cloud streaming player URL
    const url = `https://webtor.io/show?magnet=${encodeURIComponent(this.torrentMagnet)}`;
    this.torrentStreamUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}
