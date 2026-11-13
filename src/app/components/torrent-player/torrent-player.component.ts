import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, AfterViewInit, SimpleChanges, ViewChild, ElementRef, HostListener } from '@angular/core';
import { TorrentService, TorrentSource } from '../../services/torrent.service';
import { SubtitleService, SubtitleTrack } from '../../services/subtitle.service';
import { OfflineStorageService } from '../../services/offline-storage.service';

@Component({
  selector: 'app-torrent-player',
  templateUrl: './torrent-player.component.html',
  styleUrls: ['./torrent-player.component.css']
})
export class TorrentPlayerComponent implements OnChanges, OnDestroy, AfterViewInit {
  @Input() sources: TorrentSource[] = [];
  @Input() sourcesLoading = false;
  @Input() title: string = '';
  @Input() info: string = '';
  @Input() backdropUrl: string = '';
  @Input() posterUrl: string = '';
  @Input() overview: string = '';
  @Input() backLink: string = '/';
  @Input() hasPrev = false;
  @Input() hasNext = false;
  @Input() subtitles: SubtitleTrack[] = [];
  @Input() seasons: any[] = [];
  @Input() episodes: any[] = [];
  @Input() currentSeason = 1;
  @Input() currentEpisode = 1;
  @Input() resumeKey: string = '';
  @Input() directUrl: string | null = null;
  @Input() directSubtitleUrl: string | null = null;
  @Input() directSubtitleName: string | null = null;
  @Input() showBack = true;
  @Input() knownDuration = 0;

  @Output() prevEpisode = new EventEmitter<void>();
  @Output() nextEpisode = new EventEmitter<void>();
  @Output() selectEpisode = new EventEmitter<number>();
  @Output() selectSeason = new EventEmitter<number>();
  @Output() unplayable = new EventEmitter<void>();
  @Output() retrySources = new EventEmitter<void>();

  @ViewChild('videoPlayer') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('playerHost') playerHostRef!: ElementRef<HTMLElement>;

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
  bufferedTime = 0;
  streamStartTime = 0;
  showControls = true;
  muted = false;
  volume = 1;
  isFullscreen = false;
  showSubtitleMenu = false;
  showEpisodeMenu = false;
  showSeasonDropdown = false;
  activeSubtitle: SubtitleTrack | null = null;
  subtitleOffset = 0;
  activeSubtitleText = '';
  toastMessage: string | null = null;
  showResumeDialog = false;
  resumePosition = 0;
  downloadState: { status: string; progress: number; message: string; downloaded: number; total: number } | null = null;

  private currentStreamId: string | null = null;
  private refreshAttempts = 0;
  private seekDebounceTimer: any = null;
  // True total runtime reported by the server (probed from the file). Fragmented
  // MP4 remuxes only give the browser a progressive duration, so this is used
  // for the HUD instead of the growing video.duration.
  private sourceDuration = 0;
  private controlsTimeout: any = null;
  private progressSub: any = null;
  private stallWatcher: any = null;
  private streamSeq = 0;
  private lastDownloaded = 0;
  private lastProgressAt = 0;
  private triedSources = new Set<TorrentSource>();
  private applySubtitleSeq = 0;
  private subtitleObjectUrl: string | null = null;
  private parsedCues: Array<{ start: number; end: number; text: string }> = [];
  private toastTimeout: any = null;
  private syncPollTimer: any = null;
  private downloadPollTimer: any = null;
  private currentDownloadId: string | null = null;
  private resumeTimer: any = null;
  private resumeHandled = false;
  private static readonly STALL_TIMEOUT = 18000;
  private readonly SUBTITLE_PREF_KEY = 'soulima_subtitle_lang';
  private readonly RESUME_PREFIX = 'soulima_resume:';

  constructor(
    private torrentService: TorrentService,
    private subtitleService: SubtitleService,
    private offlineStorage: OfflineStorageService
  ) {}

  get bufferedRatio(): number {
    const total = this.displayDuration;
    return total ? (this.bufferedTime / total) * 100 : 0;
  }

  get playedRatio(): number {
    const total = this.displayDuration;
    return total ? (this.currentTime / total) * 100 : 0;
  }

  get isUnreleased(): boolean {
    if (!this.info) return false;
    const yearMatch = this.info.match(/\b(20\d\d)\b/);
    if (!yearMatch) return false;
    const year = parseInt(yearMatch[1], 10);
    const currentYear = new Date().getFullYear();
    return year > currentYear;
  }

  get displayDuration(): number {
    const known = this.knownDuration > 0 ? this.knownDuration : this.sourceDuration;
    if (known > 0) return known;
    return isFinite(this.duration) && this.duration > 0 ? this.duration : 0;
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    const video = this.videoRef?.nativeElement;
    if (!video) return;

    switch (event.key) {
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        this.togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.skip(-10);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.skip(10);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.setVolume(this.volume + 0.1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.setVolume(this.volume - 0.1);
        break;
      case 'm':
      case 'M':
        this.toggleMute();
        break;
      case 'f':
      case 'F':
        this.toggleFullscreen();
        break;
      case 'g':
      case 'G':
      case 'z':
      case 'Z':
        this.adjustSubtitleOffset(event.shiftKey ? -0.1 : -0.5);
        break;
      case 'h':
      case 'H':
      case 'x':
      case 'X':
        this.adjustSubtitleOffset(event.shiftKey ? 0.1 : 0.5);
        break;
      case 'Escape':
        if (this.showSubtitleMenu || this.showEpisodeMenu) {
          this.showSubtitleMenu = false;
          this.showEpisodeMenu = false;
          this.showSeasonDropdown = false;
          break;
        }
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        break;
    }
  }

  adjustSubtitleOffset(seconds: number) {
    this.subtitleOffset = Math.round((this.subtitleOffset + seconds) * 10) / 10;
    const sign = this.subtitleOffset > 0 ? '+' : '';
    this.showToast(`Subtitle Delay: ${sign}${this.subtitleOffset.toFixed(1)}s`);
    this.updateActiveSubtitleText();
  }

  resetSubtitleOffset() {
    this.subtitleOffset = 0;
    this.showToast('Subtitle Delay Reset (0.0s)');
    this.updateActiveSubtitleText();
  }

  formatOffset(offset: number): string {
    if (!offset) return '0.0s';
    const sign = offset > 0 ? '+' : '';
    return `${sign}${offset.toFixed(1)}s`;
  }

  showToast(msg: string) {
    this.toastMessage = msg;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage = null, 2500);
  }

  skip(seconds: number) {
    const total = this.displayDuration;
    if (!total) return;
    const target = Math.max(0, Math.min(total, this.currentTime + seconds));
    this.performSeek(target);
  }

  ngOnChanges(changes: SimpleChanges) {
    const episodeChanged = !!(changes['currentEpisode'] && !changes['currentEpisode'].firstChange);
    const seasonChanged = !!(changes['currentSeason'] && !changes['currentSeason'].firstChange);
    if (episodeChanged || seasonChanged) {
      this.selectedSource = null;
      this.stopStream();
      this.triedSources.clear();
      this.loading = true;
      this.ready = false;
    }

    if (changes['sources'] || ((episodeChanged || seasonChanged) && this.sources?.length)) {
      if (!this.sources?.length) {
        this.loading = false;
        this.ready = false;
      } else if (!this.selectedSource || !this.sources.includes(this.selectedSource) || episodeChanged || seasonChanged) {
        this.triedSources.clear();
        this.selectedSource = this.pickBestSource(this.sources);
        // Prefetch secondary sources in background for instant fallback
        this.sources.slice(0, 3).forEach(s => {
          if (s.magnet && s !== this.selectedSource) {
            this.torrentService.prefetchStream(s.magnet, this.currentSeason, this.currentEpisode);
          }
        });
        this.startStream();
      }
    }
    if (changes['subtitles']) {
      const saved = localStorage.getItem(this.SUBTITLE_PREF_KEY);
      if (saved === 'off') {
        this.activeSubtitle = null;
      } else {
        this.activeSubtitle =
          (saved ? this.subtitles.find(s => s.lang === saved) : null)
          || this.subtitles.find(s => s.lang === 'ar')
          || this.subtitles.find(s => s.lang === 'en')
          || this.subtitles[0]
          || null;
      }
      this.applySubtitle();
    }
    if (changes['knownDuration']) {
      if (this.knownDuration > 0) {
        this.sourceDuration = this.knownDuration;
      }
    }
    if (changes['directUrl']) {
      this.stopStream();
      this.triedSources.clear();
      this.showResumeDialog = false;
      this.resumePosition = 0;
      this.resumeHandled = false;
      if (this.directUrl) {
        this.playDirect();
      } else {
        this.loading = false;
        this.ready = false;
        this.error = null;
        this.currentTime = 0;
        this.duration = 0;
        this.bufferedTime = 0;
      }
    }
    if (changes['directSubtitleUrl']) {
      if (this.directUrl && this.directSubtitleUrl) {
        this.activeSubtitle = {
          lang: 'custom',
          langName: this.directSubtitleName || 'Custom Subtitles',
          fileId: this.directSubtitleUrl,
        };
        this.activeSubtitleText = '';
        this.parsedCues = [];
        this.applySubtitle();
      } else if (this.directUrl && !this.directSubtitleUrl) {
        this.activeSubtitle = null;
        this.activeSubtitleText = '';
        this.parsedCues = [];
        this.applySubtitle();
      }
    }
  }

  toggleSubtitleMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.showSubtitleMenu = !this.showSubtitleMenu;
    this.showEpisodeMenu = false;
    this.showSeasonDropdown = false;
  }

  toggleEpisodeMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.showEpisodeMenu = !this.showEpisodeMenu;
    this.showSubtitleMenu = false;
    this.showSeasonDropdown = false;
    if (this.showEpisodeMenu) this.showControls = true;
  }

  closeEpisodeMenu() {
    this.showEpisodeMenu = false;
    this.showSeasonDropdown = false;
  }

  toggleSeasonDropdown(event?: Event) {
    if (event) event.stopPropagation();
    this.showSeasonDropdown = !this.showSeasonDropdown;
  }

  pickSeason(index: number) {
    this.showSeasonDropdown = false;
    this.selectSeason.emit(index);
  }

  pickEpisode(episodeNumber: number) {
    this.closeEpisodeMenu();
    this.cancelDownload();
    this.tearDownForEpisodeSwitch();
    this.selectEpisode.emit(episodeNumber);
  }

  goToNextEpisode() {
    this.closeEpisodeMenu();
    this.cancelDownload();
    this.tearDownForEpisodeSwitch();
    this.nextEpisode.emit();
  }

  goToPrevEpisode() {
    this.closeEpisodeMenu();
    this.cancelDownload();
    this.tearDownForEpisodeSwitch();
    this.prevEpisode.emit();
  }

  private tearDownForEpisodeSwitch() {
    // Persist current position before tearing down the video element
    this.saveResume();
    this.stopResumeTimer();

    // Instantly reset video element and stop old stream for fast episode switching
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    this.stopStream();
    this.loading = true;
    this.ready = false;
    this.error = null;
    this.currentTime = 0;
    this.streamStartTime = 0;
    this.duration = 0;
    this.bufferedTime = 0;
    this.activeSubtitleText = '';
    this.parsedCues = [];
    this.resumeHandled = false;
    this.showResumeDialog = false;
    this.resumePosition = 0;
  }

  episodeThumb(episode: any): string {
    if (episode?.still_path) return `https://image.tmdb.org/t/p/w300${episode.still_path}`;
    return this.posterUrl || '';
  }

  selectSubtitle(sub: SubtitleTrack | null) {
    this.activeSubtitle = sub;
    this.showSubtitleMenu = false;
    localStorage.setItem(this.SUBTITLE_PREF_KEY, sub ? sub.lang : 'off');
    this.parsedCues = [];
    this.activeSubtitleText = '';
    this.applySubtitle();
    this.showToast(sub ? `Subtitles: ${sub.langName}` : 'Subtitles Off');
  }

  private applySubtitle(video?: HTMLVideoElement) {
    if (this.syncPollTimer) { clearInterval(this.syncPollTimer); this.syncPollTimer = null; }
    const v = video || this.videoRef?.nativeElement;
    if (!v) return;
    this.removeSubtitleTrack(v);
    this.parsedCues = [];
    this.activeSubtitleText = '';
    if (!this.activeSubtitle) return;
    this.applySubtitleSeq++;
    const seq = this.applySubtitleSeq;
    const fileId = this.activeSubtitle.fileId;
    const streamId = this.currentStreamId;

    const textPromise: Promise<string> = this.directUrl
      ? fetch(fileId).then(r => r.text()).catch(() => '')
      : this.subtitleService.getSubtitleText(fileId, streamId);

    textPromise.then(text => {
      if (seq !== this.applySubtitleSeq || !text) return;
      this.loadCuesIntoPlayer(v, seq, text);

      // Poll for background-synced version (ffsubsync runs async on server)
      if (streamId) {
        let polls = 0;
        this.syncPollTimer = setInterval(() => {
          polls++;
          if (polls > 12 || seq !== this.applySubtitleSeq) {
            clearInterval(this.syncPollTimer); this.syncPollTimer = null;
            return;
          }
          this.subtitleService.getSubtitleText(fileId, streamId).then(fresh => {
            if (seq !== this.applySubtitleSeq || !fresh || fresh === text) return;
            this.loadCuesIntoPlayer(v, seq, fresh);
            clearInterval(this.syncPollTimer); this.syncPollTimer = null;
            this.showToast('Subtitles auto-synced ✓');
          }).catch(() => {});
        }, 15000);
      }
    }).catch(() => {
      this.parsedCues = [];
      this.activeSubtitleText = '';
    });
  }

  private loadCuesIntoPlayer(v: HTMLVideoElement, seq: number, text: string) {
    if (seq !== this.applySubtitleSeq || !v.isConnected) return;
    const sanitized = this.sanitizeSubtitleText(text);
    this.parsedCues = this.parseVttCues(sanitized);
    this.updateActiveSubtitleText();
    if (this.subtitleObjectUrl) URL.revokeObjectURL(this.subtitleObjectUrl);
    this.subtitleObjectUrl = URL.createObjectURL(new Blob([sanitized], { type: 'text/vtt' }));
    // Remove stale track, add fresh one
    const old = v.querySelector('track');
    if (old) old.remove();
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.default = true;
    if (this.activeSubtitle) {
      track.label = this.activeSubtitle.langName;
      track.srclang = this.activeSubtitle.lang;
    }
    track.src = this.subtitleObjectUrl;
    v.appendChild(track);
    track.track.mode = 'hidden'; // Use hidden; we render our own overlay
  }

  private sanitizeSubtitleText(text: string): string {
    return text
      .replace(/^(?:STYLE|NOTE|REGION)\b[\s\S]*?^\s*$/gm, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/<font[^>]*>/gi, '')
      .replace(/<\/font>/gi, '')
      .replace(/<c(?:\.[a-z0-9_-]+)*>/gi, '')
      .replace(/<\/c>/gi, '')
      .replace(/<v[^>]*>[\s\S]*?<\/v>/gi, '')
      .replace(/style="[^"]*"/gi, '')
      .replace(/color="[^"]*"/gi, '');
  }

  private parseVttCues(vttText: string): Array<{ start: number; end: number; text: string }> {
    const cues: Array<{ start: number; end: number; text: string }> = [];
    const lines = vttText.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      const match = line.match(/^(\d{2}:\d{2}:\d{2}[\.,]\d{3}|\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[\.,]\d{3}|\d{2}:\d{2}[\.,]\d{3})/);
      if (match) {
        const parseTime = (tStr: string) => {
          const parts = tStr.replace(',', '.').split(':');
          if (parts.length === 3) {
            return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
          } else {
            return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
          }
        };
        const start = parseTime(match[1]);
        const end = parseTime(match[2]);
        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
          const cleanLine = lines[i]
            .replace(/\{[^}]*\}/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
          if (cleanLine) textLines.push(cleanLine);
          i++;
        }
        if (textLines.length) {
          cues.push({ start, end, text: textLines.join('\n') });
        }
      } else {
        i++;
      }
    }
    return cues;
  }

  private updateActiveSubtitleText() {
    if (!this.parsedCues.length || !this.activeSubtitle) {
      this.activeSubtitleText = '';
      return;
    }
    const time = this.currentTime - this.subtitleOffset;
    const active = this.parsedCues.filter(c => time >= c.start && time <= c.end);
    this.activeSubtitleText = active.map(c => c.text).join('\n');
  }

  private removeSubtitleTrack(v: HTMLVideoElement) {
    if (this.syncPollTimer) { clearInterval(this.syncPollTimer); this.syncPollTimer = null; }
    v.querySelectorAll('track').forEach(t => t.remove());
    if (this.subtitleObjectUrl) {
      URL.revokeObjectURL(this.subtitleObjectUrl);
      this.subtitleObjectUrl = null;
    }
    this.parsedCues = [];
    this.activeSubtitleText = '';
  }

  async startStream() {
    if (!this.selectedSource) return;
    this.triedSources.add(this.selectedSource);
    const seq = ++this.streamSeq;
    this.stopStream();
    this.loading = true;
    this.error = null;
    this.ready = false;
    this.currentTime = 0;
    this.streamStartTime = 0;
    this.duration = 0;
    this.bufferedTime = 0;
    this.lastDownloaded = 0;
    this.lastProgressAt = Date.now();
    this.refreshAttempts = 0;
    this.sourceDuration = 0;
    this.resumeHandled = false;
    this.showResumeDialog = false;
    this.resumePosition = 0;

    const video = this.videoRef?.nativeElement;
    if (video) {
      video.removeAttribute('src');
      video.load();
    }

    try {
      const info = await this.torrentService.requestStream(this.selectedSource.magnet, this.currentSeason, this.currentEpisode);
      if (seq !== this.streamSeq) {
        this.torrentService.stopStream(info.id);
        return;
      }
      this.currentStreamId = info.id;
      this.total = info.size;
      if (info.duration && info.duration > 0) this.sourceDuration = info.duration;

      this.torrentService.startPolling(info.id);

      this.subscribeProgress(seq);

      const videoReady = this.videoRef?.nativeElement;
      if (videoReady && info.streamUrl) {
        this.applySubtitle(videoReady);
        videoReady.src = info.streamUrl;
        videoReady.load();
        videoReady.play().catch(() => {});
      }
    } catch (err: any) {
      if (seq !== this.streamSeq) return;
      this.tryNextSource();
    }
  }

  private subscribeProgress(seq: number) {
    if (this.progressSub) { this.progressSub.unsubscribe(); this.progressSub = null; }
    this.progressSub = this.torrentService.progress$.subscribe(p => {
      if (seq !== this.streamSeq) return;
      this.progress = p.progress;
      this.speed = p.speed;
      this.peers = p.peers;
      this.downloaded = p.downloaded;
      if (p.duration && p.duration > 0) this.sourceDuration = p.duration;
      this.ready = this.ready || p.ready;
      this.loading = this.loading && !p.ready;
      if (p.error) {
        // 'expired' = the server cleaned up our stream (idle timeout); grab a
        // fresh URL for the same source and resume where we were.
        if (p.error === 'expired') this.refreshCurrentStream();
        else this.tryNextSource();
      } else if (!this.ready) {
        if (p.downloaded > this.lastDownloaded) {
          this.lastDownloaded = p.downloaded;
          this.lastProgressAt = Date.now();
        } else if (Date.now() - this.lastProgressAt > (p.peers > 0 ? 30000 : TorrentPlayerComponent.STALL_TIMEOUT)) {
          this.tryNextSource();
        }
      }
    });
  }

  // Re-request the same torrent after the server expired the old stream URL.
  private refreshCurrentStream() {
    if (!this.selectedSource) return;
    if (this.refreshAttempts >= 2) { this.tryNextSource(); return; }
    this.refreshAttempts++;
    const seq = ++this.streamSeq;
    this.stopStream();
    this.loading = true;
    this.error = null;
    this.ready = false;
    this.lastDownloaded = 0;
    this.lastProgressAt = Date.now();

    const video = this.videoRef?.nativeElement;
    const resumePos = this.currentTime > 0 ? this.currentTime : 0;
    if (video) {
      video.removeAttribute('src');
      video.load();
    }

    this.torrentService.requestStream(this.selectedSource.magnet, this.currentSeason, this.currentEpisode).then(info => {
      if (seq !== this.streamSeq) {
        this.torrentService.stopStream(info.id);
        return;
      }
      this.currentStreamId = info.id;
      this.total = info.size;
      if (info.duration && info.duration > 0) this.sourceDuration = info.duration;
      this.torrentService.startPolling(info.id);
      this.subscribeProgress(seq);
      const v = this.videoRef?.nativeElement;
      if (v && info.streamUrl) {
        this.applySubtitle(v);
        if (resumePos > 0) {
          this.performSeek(resumePos);
        } else {
          v.src = info.streamUrl;
          v.load();
          v.play().catch(() => {});
        }
      }
    }).catch(() => {
      if (seq === this.streamSeq) this.tryNextSource();
    });
  }

  private tryNextSource() {
    const remaining = this.sources.filter(s => !this.triedSources.has(s));
    if (!remaining.length) {
      this.error = 'Unable to play this title from any available source.';
      this.loading = false;
      this.unplayable.emit();
      return;
    }
    this.selectedSource = this.pickBestSource(remaining);
    this.startStream();
  }

  private computePlayabilityScore(source: TorrentSource): number {
    const seeds = source.seeds ?? 0;
    const quality = (source.quality || '').toLowerCase();
    
    // Penalize unseeded torrents heavily
    if (seeds <= 0) return -1000;
    
    let score = 0;
    
    // Seed health is top priority for fast buffering & zero lag
    if (seeds < 5) {
      score += seeds * 15;
    } else if (seeds < 25) {
      score += 75 + (seeds - 5) * 8;
    } else if (seeds < 100) {
      score += 235 + (seeds - 25) * 2;
    } else {
      score += 385 + Math.min(50, seeds - 100);
    }
    
    // Quality preference (720p / 1080p are optimal for web streaming)
    if (quality.includes('1080')) score += 80;
    else if (quality.includes('720')) score += 75;
    else if (quality.includes('2160') || quality.includes('4k')) {
      score += (seeds >= 20 ? 40 : -150); // 4K only if high seeds
    } else {
      score += 30;
    }
    
    return score;
  }

  private pickBestSource(list: TorrentSource[]): TorrentSource {
    return list.slice().sort((a, b) => this.computePlayabilityScore(b) - this.computePlayabilityScore(a))[0];
  }

  private playDirect() {
    if (!this.directUrl) return;
    this.loading = false;
    this.ready = true;
    this.error = null;
    this.currentTime = 0;
    this.streamStartTime = 0;
    this.duration = 0;
    this.bufferedTime = 0;
    this.lastDownloaded = 0;
    this.showResumeDialog = false;
    this.resumePosition = 0;
    this.resumeHandled = false;
    this.refreshAttempts = 0;
    this.sourceDuration = this.knownDuration > 0 ? this.knownDuration : 0;

    if (this.directUrl.startsWith('http') && !this.sourceDuration) {
      fetch(this.directUrl, { method: 'HEAD' })
        .then(r => {
          const d = r.headers.get('X-Media-Duration');
          if (d) {
            const parsed = parseFloat(d);
            if (parsed > 0) this.sourceDuration = parsed;
          }
        })
        .catch(() => {});
    }

    const video = this.videoRef?.nativeElement;
    if (video) {
      video.src = this.directUrl;
      video.load();
    }
  }

  handleVideoError() {
    this.loading = false;
    if (this.directUrl) {
      this.ready = true;
      this.error = 'Unable to play this file. The video format may not be supported by this player.';
      return;
    }
    // A network error usually means the server dropped the stream (idle
    // timeout) rather than a codec problem, so try to refresh it first.
    if (this.currentStreamId) {
      this.refreshCurrentStream();
    } else {
      this.tryNextSource();
    }
  }

  onCanPlay() {
    this.loading = false;
    this.ready = true;
    this.error = null;
    const video = this.videoRef?.nativeElement;

    if (!this.resumeHandled) {
      this.resumeHandled = true;
      this.startResumeTimer();
      const saved = this.readResume();
      const dur = this.displayDuration || saved?.duration || 0;
      if (saved && !saved.watched && dur > 0 && saved.position > 15 && saved.position < dur * 0.95) {
        this.resumePosition = saved.position;
        this.showResumeDialog = true;
        return;
      }
    }

    video?.play().catch(() => {});
  }

  private stopStream() {
    this.saveResume();
    this.stopResumeTimer();
    if (this.seekDebounceTimer) {
      clearTimeout(this.seekDebounceTimer);
      this.seekDebounceTimer = null;
    }
    this.streamStartTime = 0;
    if (this.stallWatcher) { clearInterval(this.stallWatcher); this.stallWatcher = null; }
    if (this.currentStreamId) {
      this.torrentService.stopStream(this.currentStreamId);
      this.currentStreamId = null;
    }
    this.torrentService.stopPolling();
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

  toggleMute() {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    video.muted = !video.muted;
    this.muted = video.muted;
  }

  setVolume(level: number) {
    const video = this.videoRef?.nativeElement;
    this.volume = Math.max(0, Math.min(1, level));
    if (video) {
      video.volume = this.volume;
      video.muted = this.volume === 0;
      this.muted = video.muted;
    }
  }

  syncVolume() {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    this.volume = video.volume;
    this.muted = video.muted;
  }

  onTimeUpdate() {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    this.currentTime = (this.streamStartTime || 0) + (video.currentTime || 0);
    // Lock the reported duration: it must never shrink (fragmented remuxes
    // grow it as more of the file is buffered, which makes the total flicker).
    const vd = video.duration;
    if (isFinite(vd) && vd > 0) {
      const effectiveDuration = (this.streamStartTime || 0) + vd;
      // Fragmented remuxes or webm streams return a progressive duration that
      // trails currentTime. Don't lock that growing trailing duration if we don't have to.
      const isTrailingProgressive = Math.abs(vd - video.currentTime) < 3.0 && video.currentTime > 2.0;
      if (!isTrailingProgressive) {
        if (this.duration === 0 || !isFinite(this.duration) || effectiveDuration > this.duration) {
          this.duration = effectiveDuration;
        }
        if (!this.sourceDuration && effectiveDuration > this.currentTime + 10) {
          this.sourceDuration = effectiveDuration;
        }
      }
    }
    if (video.buffered.length) {
      let currentBuf = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
          currentBuf = video.buffered.end(i);
          break;
        }
      }
      this.bufferedTime = (this.streamStartTime || 0) + (currentBuf || video.buffered.end(video.buffered.length - 1));
    }
    this.updateActiveSubtitleText();
  }

  seekTo(event: MouseEvent) {
    const total = this.displayDuration;
    if (!total) return;
    const targetEl = event.currentTarget as HTMLElement;
    const bar = (targetEl.querySelector('.hudSeekTrack') as HTMLElement) || targetEl;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    this.performSeek(ratio * total);
  }

  performSeek(targetTime: number) {
    const video = this.videoRef?.nativeElement;
    const total = this.displayDuration;
    if (!video || !total) return;

    targetTime = Math.max(0, Math.min(total, targetTime));
    const relTarget = targetTime - (this.streamStartTime || 0);

    // Check if target is inside currently buffered range of the active video element
    let isBuffered = false;
    if (relTarget >= 0 && video.buffered.length) {
      for (let i = 0; i < video.buffered.length; i++) {
        if (relTarget >= video.buffered.start(i) && relTarget <= video.buffered.end(i)) {
          isBuffered = true;
          break;
        }
      }
    }

    // Direct MP4 (non-remuxed) range media seeking
    if (!this.currentStreamId && video.seekable?.length) {
      for (let i = 0; i < video.seekable.length; i++) {
        if (targetTime >= video.seekable.start(i) && targetTime <= video.seekable.end(i)) {
          video.currentTime = targetTime;
          this.currentTime = targetTime;
          this.updateActiveSubtitleText();
          return;
        }
      }
    }

    if (isBuffered) {
      try {
        video.currentTime = relTarget;
        this.currentTime = targetTime;
        this.updateActiveSubtitleText();
        return;
      } catch {}
    }

    this.seekToStreamTime(targetTime);
  }

  seekToStreamTime(targetTime: number) {
    const video = this.videoRef?.nativeElement;
    if (!video) return;

    if (this.seekDebounceTimer) {
      clearTimeout(this.seekDebounceTimer);
    }

    const seekSec = Math.floor(targetTime);
    this.currentTime = targetTime;
    this.streamStartTime = seekSec;
    this.updateActiveSubtitleText();

    this.seekDebounceTimer = setTimeout(() => {
      this.seekDebounceTimer = null;
      const base = this.currentStreamId
        ? this.torrentService.getStreamUrl(this.currentStreamId)
        : this.directUrl;
      if (!base) return;

      const cleanBase = base.replace(/([?&])startTime=\d+/g, '').replace(/([?&])_t=\d+/g, '');
      const sep = cleanBase.includes('?') ? '&' : '?';
      const newUrl = `${cleanBase}${sep}startTime=${seekSec}&_t=${Date.now()}`;

      video.src = newUrl;
      video.load();
      video.play().catch(() => {});
    }, 120);
  }

  toggleFullscreen() {
    const container = this.playerHostRef?.nativeElement;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen?.().catch(() => {});
    }
  }

  ngAfterViewInit() {
    document.body.classList.add('soulima-cinema');
    if (typeof window !== 'undefined') {
      (window as any).torrentPlayerComponent = this;
    }
  }

  onPlayerMouseMove() {
    this.showControls = true;
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
    this.controlsTimeout = setTimeout(() => this.showControls = false, 3000);
  }

  onPlayerClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, .subtitleMenu, .episodeMenu, .hudBottom, .hudTop, .subtitleSyncSection, .pauseContent, .downloadPanel')) {
      return;
    }
    this.showControls = !this.showControls;
  }

  formatTime(s: number): string {
    if (!s || !isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
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

  private get resumeStorageKey(): string {
    if (!this.resumeKey) return '';
    if (this.seasons.length || this.episodes.length) {
      return `${this.RESUME_PREFIX}${this.resumeKey}:s${this.currentSeason}:e${this.currentEpisode}`;
    }
    return `${this.RESUME_PREFIX}${this.resumeKey}`;
  }

  private readResume(): { position: number; duration: number; watched?: boolean } | null {
    const key = this.resumeStorageKey;
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.position !== 'number' || !isFinite(data.position) || data.position <= 0) return null;
      return data;
    } catch {
      return null;
    }
  }

  private saveResume() {
    const key = this.resumeStorageKey;
    if (!key) return;
    const total = this.displayDuration;
    if (!total || !isFinite(total)) return;
    const pos = this.currentTime;
    if (!pos || !isFinite(pos) || pos < 5) return;
    const pct = pos / total;
    localStorage.setItem(key, JSON.stringify({
      position: pos,
      duration: this.duration,
      watched: pct >= 0.95,
      updatedAt: Date.now(),
    }));
  }

  private clearResume() {
    const key = this.resumeStorageKey;
    if (key) localStorage.removeItem(key);
  }

  private startResumeTimer() {
    this.stopResumeTimer();
    this.resumeTimer = setInterval(() => this.saveResume(), 5000);
  }

  private stopResumeTimer() {
    if (this.resumeTimer) {
      clearInterval(this.resumeTimer);
      this.resumeTimer = null;
    }
  }

  isEpisodeWatched(episodeNumber: number): boolean {
    if (!this.resumeKey || (!this.seasons.length && !this.episodes.length)) return false;
    try {
      const raw = localStorage.getItem(`${this.RESUME_PREFIX}${this.resumeKey}:s${this.currentSeason}:e${episodeNumber}`);
      if (!raw) return false;
      const e = JSON.parse(raw);
      return !!e && e.duration > 0 && (!!e.watched || e.position >= e.duration * 0.92);
    } catch {
      return false;
    }
  }

  resumePlayback() {
    const pos = this.resumePosition;
    this.showResumeDialog = false;
    this.resumePosition = 0;
    if (pos > 0) {
      this.performSeek(pos);
    }
    this.videoRef?.nativeElement?.play().catch(() => {});
  }

  startOver() {
    this.clearResume();
    this.showResumeDialog = false;
    this.resumePosition = 0;
    this.performSeek(0);
  }

  onPause() {
    this.isPlaying = false;
    this.saveResume();
  }

  onEnded() {
    this.saveResume();
  }

  async download() {
    if (!this.currentStreamId) {
      if (this.selectedSource?.magnet) {
        window.open(this.selectedSource.magnet, '_blank');
      }
      return;
    }
    if (this.downloadState) return;
    this.downloadState = { status: 'starting', progress: 0, message: 'Preparing download…', downloaded: 0, total: 0 };
    try {
      const downloadId = await this.torrentService.startTrackedDownload(
        this.currentStreamId,
        this.activeSubtitle?.fileId,
        this.activeSubtitle?.lang
      );
      this.currentDownloadId = downloadId;
      this.pollDownload(downloadId);
    } catch (err: any) {
      this.downloadState = null;
      if (err && err.status === 429) {
        this.showToast('Daily download limit reached — try again tomorrow');
      } else {
        this.showToast('Could not start download');
      }
    }
  }

  cancelDownload() {
    if (this.currentDownloadId) {
      this.torrentService.cancelDownload(this.currentDownloadId);
    }
    this.currentDownloadId = null;
    if (this.downloadPollTimer) { clearInterval(this.downloadPollTimer); this.downloadPollTimer = null; }
    this.downloadState = null;
    this.showToast('Download cancelled');
  }

  private pollDownload(downloadId: string) {
    if (this.downloadPollTimer) clearInterval(this.downloadPollTimer);
    this.downloadPollTimer = setInterval(async () => {
      try {
        const st = await this.torrentService.getDownloadStatus(downloadId);
        if (this.downloadState) {
          this.downloadState.status = st.status;
          this.downloadState.progress = st.progress;
          this.downloadState.message = st.message;
          this.downloadState.downloaded = st.downloaded;
          this.downloadState.total = st.total;
        }
        if (st.status === 'complete') {
          clearInterval(this.downloadPollTimer);
          this.downloadPollTimer = null;
          this.currentDownloadId = null;
          const downloadFileUrl = this.torrentService.getDownloadFileUrl(downloadId);
          if (this.isDesktopApp()) {
            this.saveToDesktopLibrary(downloadId);
          } else {
            this.triggerFileDownload(downloadFileUrl);
            this.saveToOfflineStorage(downloadFileUrl);
          }
          setTimeout(() => { this.downloadState = null; }, 4000);
        } else if (st.status === 'error') {
          clearInterval(this.downloadPollTimer);
          this.downloadPollTimer = null;
          this.currentDownloadId = null;
          this.showToast(st.message || 'Download failed');
          setTimeout(() => { this.downloadState = null; }, 4000);
        } else if (st.status === 'cancelled') {
          clearInterval(this.downloadPollTimer);
          this.downloadPollTimer = null;
          this.currentDownloadId = null;
          this.downloadState = null;
        }
      } catch {
        // transient network error; keep polling
      }
    }, 1000);
  }

  private triggerFileDownload(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private isDesktopApp(): boolean {
    return document.documentElement.dataset['desktop'] === '1';
  }

  // Desktop app: move the finished download into the on-disk media library
  // (MEDIA_DIR) so it shows up in "My Downloads" and streams from disk.
  private async saveToDesktopLibrary(downloadId: string) {
    try {
      await this.torrentService.saveToMediaLibrary(downloadId, {
        id: this.resumeKey || undefined,
        title: this.title || 'Downloaded Video',
        mediaType: this.seasons.length || this.episodes.length ? 'tv' : 'movie',
        season: this.currentSeason,
        episode: this.currentEpisode,
        posterUrl: this.posterUrl,
        backdropUrl: this.backdropUrl,
        serverTitle: this.title || undefined,
      });
      this.showToast('Saved to My Downloads');
    } catch (e) {
      console.warn('Could not save to media library:', e);
      this.triggerFileDownload(this.torrentService.getDownloadFileUrl(downloadId));
      this.showToast('Download complete');
    }
  }

  private async saveToOfflineStorage(fileUrl: string) {
    try {
      const res = await fetch(fileUrl);
      if (res.ok) {
        const blob = await res.blob();
        const itemId = `offline_${Date.now()}`;
        await this.offlineStorage.saveMedia({
          id: itemId,
          title: this.title || 'Downloaded Video',
          mediaType: this.currentSeason ? 'tv' : 'movie',
          season: this.currentSeason,
          episode: this.currentEpisode,
          posterUrl: this.posterUrl,
          backdropUrl: this.backdropUrl,
          videoBlob: blob,
          fileSize: blob.size,
          mimeType: blob.type || 'video/mp4',
          downloadDate: new Date().toISOString()
        });
        this.showToast('Saved to My Downloads for offline play!');
      }
    } catch (e) {
      console.warn('Could not save media blob to offline storage:', e);
    }
  }

  ngOnDestroy() {
    document.body.classList.remove('soulima-cinema');
    if (this.currentDownloadId) {
      this.torrentService.cancelDownload(this.currentDownloadId);
    }
    if (this.downloadPollTimer) { clearInterval(this.downloadPollTimer); this.downloadPollTimer = null; }
    this.stopStream();
    this.stopResumeTimer();
  }
}
