import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, AfterViewInit, SimpleChanges, ViewChild, ElementRef, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { TorrentService, TorrentSource } from '../../services/torrent.service';
import { SubtitleService, SubtitleTrack } from '../../services/subtitle.service';
import { OfflineStorageService } from '../../services/offline-storage.service';

export type SubtitleState = 'off' | 'discovering' | 'fetching' | 'aligning' | 'ready' | 'degraded' | 'failed';

@Component({
  selector: 'app-torrent-player',
  templateUrl: './torrent-player.component.html',
  styleUrls: ['./torrent-player.component.css']
})
export class TorrentPlayerComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
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
  isBuffering = false;
  currentTime = 0;
  duration = 0;
  bufferedTime = 0;
  streamStartTime = 0;
  showControls = true;
  muted = false;
  volume = 1;
  isFullscreen = false;
  playbackSpeed = 1.0;
  readonly speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  // Menus
  showSubtitleMenu = false;
  showEpisodeMenu = false;
  showSeasonDropdown = false;
  showSourcesMenu = false;

  // Timeline scrub & hover
  isScrubbing = false;
  scrubTime = 0;
  hoverTime = 0;
  hoverPosition = 0;
  showHoverTime = false;

  // Subtitles
  activeSubtitle: SubtitleTrack | null = null;
  subtitleOffset = 0;
  activeSubtitleText = '';
  largeSubtitles = false;
  subtitleState: SubtitleState = 'off';
  subtitleStatusMessage = '';
  private triedSubtitleIds = new Set<string>();

  // Auto-play Next Episode
  autoPlayCountdown = 0;
  private autoPlayTimer: any = null;

  // Feedback & dialogs
  toastMessage: string | null = null;
  showResumeDialog = false;
  resumePosition = 0;
  downloadState: { status: string; progress: number; message: string; downloaded: number; total: number } | null = null;

  private currentStreamId: string | null = null;
  private refreshAttempts = 0;
  private seekDebounceTimer: any = null;
  private sourceDuration = 0;
  private controlsTimeout: any = null;
  private progressSub: any = null;
  private stallWatcher: any = null;
  private stallRecoveryTimer: any = null;
  private streamSeq = 0;
  private lastDownloaded = 0;
  private lastProgressAt = 0;
  private triedSources = new Set<string>();
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
  private readonly SUBTITLE_SIZE_KEY = 'soulima_subtitle_size';
  private readonly VOLUME_PREF_KEY = 'soulima_volume';
  private readonly MUTED_PREF_KEY = 'soulima_muted';
  private readonly RESUME_PREFIX = 'soulima_resume:';

  constructor(
    private torrentService: TorrentService,
    private subtitleService: SubtitleService,
    private offlineStorage: OfflineStorageService,
    private router: Router
  ) {}

  ngOnInit() {
    try {
      const savedVol = localStorage.getItem(this.VOLUME_PREF_KEY);
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v) && v >= 0 && v <= 1) this.volume = v;
      }
      const savedMuted = localStorage.getItem(this.MUTED_PREF_KEY);
      if (savedMuted !== null) {
        this.muted = savedMuted === 'true';
      }
      this.largeSubtitles = localStorage.getItem(this.SUBTITLE_SIZE_KEY) === 'large';
    } catch {}
  }

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

  get isPiPSupported(): boolean {
    return typeof document !== 'undefined' && 'pictureInPictureEnabled' in document;
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

    const code = event.keyCode;

    // Smart TV Remote Media and Color Keys
    if (event.key === 'MediaPlayPause' || code === 179 || code === 10252) {
      event.preventDefault();
      this.togglePlay();
      return;
    }
    if (event.key === 'MediaPlay' || code === 415) {
      event.preventDefault();
      if (video.paused) this.togglePlay();
      return;
    }
    if (event.key === 'MediaPause' || code === 19) {
      event.preventDefault();
      if (!video.paused) this.togglePlay();
      return;
    }
    if (event.key === 'MediaFastForward' || code === 417) {
      event.preventDefault();
      this.skip(10);
      return;
    }
    if (event.key === 'MediaRewind' || code === 412) {
      event.preventDefault();
      this.skip(-10);
      return;
    }
    if (event.key === 'MediaTrackNext' || code === 10232) {
      event.preventDefault();
      if (this.hasNext) this.nextEpisode.emit();
      return;
    }
    if (event.key === 'MediaTrackPrevious' || code === 10233) {
      event.preventDefault();
      if (this.hasPrev) this.prevEpisode.emit();
      return;
    }
    if (event.key === 'MediaStop' || code === 413) {
      event.preventDefault();
      this.router.navigateByUrl(this.backLink);
      return;
    }
    // Remote Color Keys: Red (Subtitles), Green (Sources), Yellow (Episodes), Blue (Fullscreen)
    if (event.key === 'ColorF0Red' || code === 403) {
      event.preventDefault();
      this.toggleSubtitleMenu();
      return;
    }
    if (event.key === 'ColorF1Green' || code === 404) {
      event.preventDefault();
      this.toggleSourcesMenu();
      return;
    }
    if (event.key === 'ColorF2Yellow' || code === 405) {
      event.preventDefault();
      this.toggleEpisodeMenu();
      return;
    }
    if (event.key === 'ColorF3Blue' || code === 406) {
      event.preventDefault();
      this.toggleFullscreen();
      return;
    }

    switch (event.key) {
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        this.togglePlay();
        break;
      case 'Enter':
        // Remote OK button toggles play if not focused on an interactive button
        if (!target || target === document.body || target.classList.contains('torrentPlayer')) {
          event.preventDefault();
          this.togglePlay();
        }
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
      case 'p':
      case 'P':
        this.togglePiP();
        break;
      case '>':
      case '.':
        this.cyclePlaybackSpeed(true);
        break;
      case '<':
      case ',':
        this.cyclePlaybackSpeed(false);
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
      case 'Back':
      case 'BrowserBack':
      case 'GoBack':
        event.preventDefault();
        if (this.showSubtitleMenu || this.showEpisodeMenu || this.showSourcesMenu) {
          this.showSubtitleMenu = false;
          this.showEpisodeMenu = false;
          this.showSeasonDropdown = false;
          this.showSourcesMenu = false;
          break;
        }
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
          break;
        }
        this.router.navigateByUrl(this.backLink);
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

  toggleSubtitleSize() {
    this.largeSubtitles = !this.largeSubtitles;
    try {
      localStorage.setItem(this.SUBTITLE_SIZE_KEY, this.largeSubtitles ? 'large' : 'normal');
    } catch {}
    this.showToast(this.largeSubtitles ? 'Subtitle Size: Large' : 'Subtitle Size: Normal');
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

  cyclePlaybackSpeed(forward = true) {
    const currentIdx = this.speedOptions.indexOf(this.playbackSpeed);
    let nextIdx = forward
      ? (currentIdx + 1) % this.speedOptions.length
      : (currentIdx - 1 + this.speedOptions.length) % this.speedOptions.length;
    if (currentIdx === -1) nextIdx = 2;
    this.setPlaybackSpeed(this.speedOptions[nextIdx]);
  }

  setPlaybackSpeed(speed: number) {
    this.playbackSpeed = speed;
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.playbackRate = speed;
    }
    this.showToast(`Speed: ${speed}x`);
  }

  async togglePiP() {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err: any) {
      console.warn('PiP error:', err.message);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    const episodeChanged = !!(changes['currentEpisode'] && !changes['currentEpisode'].firstChange);
    const seasonChanged = !!(changes['currentSeason'] && !changes['currentSeason'].firstChange);
    if (episodeChanged || seasonChanged) {
      this.cancelAutoPlay();
      this.selectedSource = null;
      this.stopStream();
      this.triedSources.clear();
      this.loading = true;
      this.ready = false;
      this.error = null;
    }

    if (changes['sources']) {
      if (!this.sources?.length) {
        this.loading = false;
        this.ready = false;
      } else if (!this.selectedSource || !this.sources.includes(this.selectedSource)) {
        this.triedSources.clear();
        this.selectedSource = this.pickBestSource(this.sources);
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
        this.subtitleState = 'off';
        this.subtitleStatusMessage = '';
      } else {
        this.activeSubtitle =
          (saved ? this.subtitles.find(s => s.lang === saved) : null)
          || this.subtitles.find(s => s.lang === 'ar')
          || this.subtitles.find(s => s.lang === 'en')
          || this.subtitles[0]
          || null;
        if (!this.activeSubtitle && this.sourcesLoading) {
          this.subtitleState = 'discovering';
          this.subtitleStatusMessage = 'Discovering subtitles…';
        }
      }
      this.applySubtitle();
    }
    if (changes['knownDuration']) {
      if (this.knownDuration > 0) {
        this.sourceDuration = this.knownDuration;
      }
    }
    if (changes['directUrl']) {
      this.cancelAutoPlay();
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
    this.showSourcesMenu = false;
  }

  toggleEpisodeMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.showEpisodeMenu = !this.showEpisodeMenu;
    this.showSubtitleMenu = false;
    this.showSeasonDropdown = false;
    this.showSourcesMenu = false;
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

  toggleSourcesMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.showSourcesMenu = !this.showSourcesMenu;
    this.showSubtitleMenu = false;
    this.showEpisodeMenu = false;
    this.showSeasonDropdown = false;
  }

  switchSource(source: TorrentSource) {
    this.showSourcesMenu = false;
    if (source === this.selectedSource) return;
    const resumePos = this.currentTime;
    this.selectedSource = source;
    this.showToast(`Switching to ${source.quality || 'Source'} (${source.seeds || 0} seeds)`);
    this.startStream(resumePos);
  }

  pickSeason(index: number) {
    this.showSeasonDropdown = false;
    this.selectSeason.emit(index);
  }

  pickEpisode(episodeNumber: number) {
    this.closeEpisodeMenu();
    this.cancelAutoPlay();
    this.cancelDownload();
    this.tearDownForEpisodeSwitch();
    this.selectEpisode.emit(episodeNumber);
  }

  goToNextEpisode() {
    this.closeEpisodeMenu();
    this.cancelAutoPlay();
    this.cancelDownload();
    this.tearDownForEpisodeSwitch();
    this.nextEpisode.emit();
  }

  goToPrevEpisode() {
    this.closeEpisodeMenu();
    this.cancelAutoPlay();
    this.cancelDownload();
    this.tearDownForEpisodeSwitch();
    this.prevEpisode.emit();
  }

  private tearDownForEpisodeSwitch() {
    this.saveResume();
    this.stopResumeTimer();

    const video = this.videoRef?.nativeElement;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    this.stopStream();
    this.triedSources.clear();
    this.selectedSource = null;
    this.triedSubtitleIds.clear();
    this.loading = true;
    this.ready = false;
    this.error = null;
    this.currentTime = 0;
    this.streamStartTime = 0;
    this.duration = 0;
    this.bufferedTime = 0;
    this.subtitleOffset = 0;
    this.activeSubtitleText = '';
    this.parsedCues = [];
    this.subtitleState = 'off';
    this.subtitleStatusMessage = '';
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
    this.subtitleOffset = 0;
    this.triedSubtitleIds.clear();
    localStorage.setItem(this.SUBTITLE_PREF_KEY, sub ? sub.lang : 'off');
    this.parsedCues = [];
    this.activeSubtitleText = '';
    this.applySubtitle();
    this.showToast(sub ? `Subtitles: ${sub.langName}` : 'Subtitles Off');
  }

  retrySubtitles() {
    this.triedSubtitleIds.clear();
    this.applySubtitle();
  }

  private applySubtitle(video?: HTMLVideoElement, isFallback = false) {
    if (this.syncPollTimer) { clearInterval(this.syncPollTimer); this.syncPollTimer = null; }
    const v = video || this.videoRef?.nativeElement;
    if (!v) return;
    this.removeSubtitleTrack(v);
    this.parsedCues = [];
    this.activeSubtitleText = '';

    if (!this.activeSubtitle) {
      this.subtitleState = 'off';
      this.subtitleStatusMessage = '';
      return;
    }

    if (!isFallback) {
      this.triedSubtitleIds.clear();
    }

    this.subtitleState = 'fetching';
    this.subtitleStatusMessage = 'Loading subtitles…';
    this.applySubtitleSeq++;
    const seq = this.applySubtitleSeq;
    const fileId = this.activeSubtitle.fileId;
    this.triedSubtitleIds.add(fileId);
    const streamId = this.currentStreamId;

    const contentPromise = this.directUrl
      ? fetch(fileId)
          .then(r => r.text())
          .then(text => ({ text, syncStatus: 'unavailable' as const }))
          .catch(() => ({ text: '', syncStatus: 'unavailable' as const }))
      : this.subtitleService.getSubtitleContent(fileId, streamId)
          .catch(() => ({ text: '', syncStatus: 'failed' as const }));

    contentPromise.then(res => {
      if (seq !== this.applySubtitleSeq) return;
      if (!res.text || !res.text.trim()) {
        this.triggerSubtitleFallback(v, seq);
        return;
      }

      const cues = this.loadCuesIntoPlayer(v, seq, res.text);
      if (!cues || cues.length === 0) {
        this.triggerSubtitleFallback(v, seq);
        return;
      }

      this.updateSyncState(res.syncStatus, fileId, streamId, seq, v, res.text);
    }).catch(() => {
      if (seq === this.applySubtitleSeq) {
        this.triggerSubtitleFallback(v, seq);
      }
    });
  }

  private triggerSubtitleFallback(v: HTMLVideoElement, seq: number) {
    if (seq !== this.applySubtitleSeq) return;
    const curLang = this.activeSubtitle?.lang;
    const sameLangAlt = this.subtitles.find(s => !this.triedSubtitleIds.has(s.fileId) && s.lang === curLang);
    const fallbackTrack = sameLangAlt || this.subtitles.find(s => !this.triedSubtitleIds.has(s.fileId));

    if (fallbackTrack) {
      this.activeSubtitle = fallbackTrack;
      this.showToast(`Retrying subtitles (${fallbackTrack.langName})…`);
      this.applySubtitle(v, true);
    } else {
      this.parsedCues = [];
      this.activeSubtitleText = '';
      this.subtitleState = 'failed';
      this.subtitleStatusMessage = 'Subtitles unavailable';
      this.showToast('Subtitles unavailable for this title');
    }
  }

  private updateSyncState(
    syncStatus: string,
    fileId: string,
    streamId: string | null,
    seq: number,
    v: HTMLVideoElement,
    initialText: string
  ) {
    if (syncStatus === 'synced') {
      this.subtitleState = 'ready';
      this.subtitleStatusMessage = 'Synced';
      return;
    }
    if (syncStatus === 'unavailable') {
      this.subtitleState = 'degraded';
      this.subtitleStatusMessage = 'Standard timing';
      return;
    }
    if (syncStatus === 'failed') {
      this.subtitleState = 'degraded';
      this.subtitleStatusMessage = 'Standard timing (sync failed)';
      return;
    }

    if (streamId) {
      this.subtitleState = 'aligning';
      this.subtitleStatusMessage = 'Aligning subtitles…';
      let polls = 0;
      let lastText = initialText;

      this.syncPollTimer = setInterval(() => {
        polls++;
        if (polls > 16 || seq !== this.applySubtitleSeq) {
          clearInterval(this.syncPollTimer);
          this.syncPollTimer = null;
          if (this.subtitleState === 'aligning') {
            this.subtitleState = 'degraded';
            this.subtitleStatusMessage = 'Standard timing';
          }
          return;
        }

        this.subtitleService.getSubtitleContent(fileId, streamId).then(fresh => {
          if (seq !== this.applySubtitleSeq) return;
          if (fresh.syncStatus === 'synced') {
            if (fresh.text && fresh.text !== lastText) {
              this.loadCuesIntoPlayer(v, seq, fresh.text);
              lastText = fresh.text;
            }
            this.subtitleState = 'ready';
            this.subtitleStatusMessage = 'Synced';
            this.showToast('Subtitles synchronized');
            clearInterval(this.syncPollTimer);
            this.syncPollTimer = null;
          } else if (fresh.syncStatus === 'failed' || fresh.syncStatus === 'unavailable') {
            this.subtitleState = 'degraded';
            this.subtitleStatusMessage = 'Standard timing';
            clearInterval(this.syncPollTimer);
            this.syncPollTimer = null;
          }
        }).catch(() => {});
      }, 15000);
    } else {
      this.subtitleState = 'degraded';
      this.subtitleStatusMessage = 'Standard timing';
    }
  }

  private loadCuesIntoPlayer(v: HTMLVideoElement, seq: number, text: string): Array<{ start: number; end: number; text: string }> {
    if (seq !== this.applySubtitleSeq || !v.isConnected) return [];
    const sanitized = this.sanitizeSubtitleText(text);
    this.parsedCues = this.parseVttCues(sanitized);
    this.updateActiveSubtitleText();
    if (this.parsedCues.length > 0) {
      if (this.subtitleObjectUrl) URL.revokeObjectURL(this.subtitleObjectUrl);
      this.subtitleObjectUrl = URL.createObjectURL(new Blob([sanitized], { type: 'text/vtt' }));
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
      track.track.mode = 'hidden';
    }
    return this.parsedCues;
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
      if (this.activeSubtitleText) this.activeSubtitleText = '';
      return;
    }
    const time = this.currentTime - this.subtitleOffset;
    if (time < 0) {
      if (this.activeSubtitleText) this.activeSubtitleText = '';
      return;
    }

    let low = 0;
    let high = this.parsedCues.length - 1;
    let foundIdx = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const cue = this.parsedCues[mid];
      if (time >= cue.start && time <= cue.end) {
        foundIdx = mid;
        break;
      } else if (time < cue.start) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    let newText = '';
    if (foundIdx !== -1) {
      const matches: string[] = [];
      let l = foundIdx;
      while (l >= 0 && this.parsedCues[l].start >= time - 60) {
        if (time >= this.parsedCues[l].start && time <= this.parsedCues[l].end) {
          if (!matches.includes(this.parsedCues[l].text)) {
            matches.unshift(this.parsedCues[l].text);
          }
        }
        l--;
      }
      let r = foundIdx + 1;
      while (r < this.parsedCues.length && this.parsedCues[r].start <= time) {
        if (time >= this.parsedCues[r].start && time <= this.parsedCues[r].end) {
          if (!matches.includes(this.parsedCues[r].text)) {
            matches.push(this.parsedCues[r].text);
          }
        }
        r++;
      }
      newText = matches.join('\n');
    } else {
      let idx = Math.max(0, high);
      while (idx > 0 && this.parsedCues[idx].start >= time - 60) {
        idx--;
      }
      const matches: string[] = [];
      while (idx < this.parsedCues.length && this.parsedCues[idx].start <= time) {
        if (time >= this.parsedCues[idx].start && time <= this.parsedCues[idx].end) {
          if (!matches.includes(this.parsedCues[idx].text)) {
            matches.push(this.parsedCues[idx].text);
          }
        }
        idx++;
      }
      newText = matches.join('\n');
    }

    if (this.activeSubtitleText !== newText) {
      this.activeSubtitleText = newText;
    }
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

  private sourceKey(s: TorrentSource): string {
    if (!s) return '';
    const m = s.magnet?.match(/btih:([a-fA-F0-9]+)/i);
    return m ? m[1].toLowerCase() : (s.magnet || s.quality || '');
  }

  async startStream(resumeAt?: number) {
    if (!this.selectedSource) return;
    this.triedSources.add(this.sourceKey(this.selectedSource));
    const seq = ++this.streamSeq;
    this.stopStream();
    this.loading = true;
    this.isBuffering = false;
    this.error = null;
    this.ready = false;
    this.currentTime = resumeAt && resumeAt > 0 ? resumeAt : 0;
    this.streamStartTime = 0;
    this.duration = 0;
    this.bufferedTime = 0;
    this.lastDownloaded = 0;
    this.lastProgressAt = Date.now();
    this.refreshAttempts = 0;
    this.sourceDuration = 0;
    this.resumeHandled = resumeAt && resumeAt > 0 ? true : false;
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
        this.updateMediaSession();
        if (resumeAt && resumeAt > 0) {
          // Set src with startTime directly — avoids double-load from performSeek
          // overwriting the URL that was just assigned.
          const seekSec = Math.floor(resumeAt);
          this.streamStartTime = seekSec;
          this.currentTime = resumeAt;
          const sep = info.streamUrl.includes('?') ? '&' : '?';
          videoReady.src = `${info.streamUrl}${sep}startTime=${seekSec}&_t=${Date.now()}`;
          videoReady.load();
          videoReady.play().catch(() => {});
        } else {
          videoReady.src = info.streamUrl;
          videoReady.load();
          videoReady.play().catch(() => {});
        }
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

  private refreshCurrentStream() {
    if (!this.selectedSource) return;
    if (this.refreshAttempts >= 2) { this.tryNextSource(); return; }
    this.refreshAttempts++;
    const seq = ++this.streamSeq;
    this.stopStream();
    this.loading = true;
    this.isBuffering = false;
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
        this.updateMediaSession();
        if (resumePos > 0) {
          const seekSec = Math.floor(resumePos);
          this.streamStartTime = seekSec;
          this.currentTime = resumePos;
          const sep = info.streamUrl.includes('?') ? '&' : '?';
          v.src = `${info.streamUrl}${sep}startTime=${seekSec}&_t=${Date.now()}`;
          v.load();
          v.play().catch(() => {});
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
    const remaining = this.sources.filter(s => !this.triedSources.has(this.sourceKey(s)));
    if (!remaining.length) {
      this.error = 'Unable to play this title from any available source.';
      this.loading = false;
      this.isBuffering = false;
      this.unplayable.emit();
      return;
    }
    this.selectedSource = this.pickBestSource(remaining);
    this.startStream();
  }

  private computePlayabilityScore(source: TorrentSource): number {
    const seeds = source.seeds ?? 0;
    const quality = (source.quality || '').toLowerCase();
    
    if (seeds <= 0) return -1000;
    
    let score = 0;
    if (seeds < 5) {
      score += seeds * 15;
    } else if (seeds < 25) {
      score += 75 + (seeds - 5) * 8;
    } else if (seeds < 100) {
      score += 235 + (seeds - 25) * 2;
    } else {
      score += 385 + Math.min(50, seeds - 100);
    }
    
    if (quality.includes('1080')) score += 80;
    else if (quality.includes('720')) score += 75;
    else if (quality.includes('2160') || quality.includes('4k')) {
      score += (seeds >= 20 ? 40 : -150);
    } else {
      score += 30;
    }

    if (quality.includes('x264') || quality.includes('h264') || quality.includes('avc')) {
      score += 35;
    }
    
    return score;
  }

  private pickBestSource(list: TorrentSource[]): TorrentSource {
    return list.slice().sort((a, b) => this.computePlayabilityScore(b) - this.computePlayabilityScore(a))[0];
  }

  private playDirect() {
    if (!this.directUrl) return;
    this.loading = false;
    this.isBuffering = false;
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

    const video = this.videoRef?.nativeElement;
    if (video) {
      video.src = this.directUrl;
      video.load();
      this.updateMediaSession();
    }
  }

  handleVideoError() {
    this.loading = false;
    this.isBuffering = false;
    const video = this.videoRef?.nativeElement;
    const code = video?.error?.code;
    if (this.directUrl) {
      this.ready = true;
      this.error = 'Unable to play this file. The video format may not be supported by this player.';
      return;
    }
    if (code === 3 || code === 4) {
      if (this.downloaded < 1024 * 1024 && this.currentStreamId && this.refreshAttempts < 2) {
        console.warn(`[player] Buffer ramp-up decode wait code=${code}, refreshing stream`);
        this.refreshCurrentStream();
        return;
      }
      console.warn(`[player] Format/codec error code=${code}, skipping to next source`);
      this.tryNextSource();
      return;
    }
    if (this.currentStreamId) {
      this.refreshCurrentStream();
    } else {
      this.tryNextSource();
    }
  }

  onCanPlay() {
    this.loading = false;
    this.isBuffering = false;
    this.ready = true;
    this.error = null;
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.volume = this.volume;
      video.muted = this.muted;
      if (this.playbackSpeed !== 1.0) {
        video.playbackRate = this.playbackSpeed;
      }
    }

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

  onWaiting() {
    if (!this.ready) return;
    this.isBuffering = true;
    if (this.stallRecoveryTimer) clearTimeout(this.stallRecoveryTimer);
    this.stallRecoveryTimer = setTimeout(() => {
      if (this.isBuffering && this.isPlaying) {
        console.warn('[player] Playback stalled for 18s, attempting stream recovery');
        this.showToast('Reconnecting stream…');
        if (this.directUrl) {
          const video = this.videoRef?.nativeElement;
          if (video) {
            const curTime = video.currentTime;
            const onMeta = () => {
              try { video.currentTime = curTime; } catch {}
              video.play().catch(() => {});
            };
            video.addEventListener('loadedmetadata', onMeta, { once: true });
            video.load();
          }
        } else {
          this.refreshCurrentStream();
        }
      }
    }, 18000);
  }

  onPlaying() {
    this.isBuffering = false;
    this.isPlaying = true;
    if (this.stallRecoveryTimer) {
      clearTimeout(this.stallRecoveryTimer);
      this.stallRecoveryTimer = null;
    }
  }

  private stopStream() {
    this.saveResume();
    this.stopResumeTimer();
    if (this.seekDebounceTimer) {
      clearTimeout(this.seekDebounceTimer);
      this.seekDebounceTimer = null;
    }
    if (this.stallRecoveryTimer) {
      clearTimeout(this.stallRecoveryTimer);
      this.stallRecoveryTimer = null;
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
    this.muted = !this.muted;
    if (video) {
      video.muted = this.muted;
      if (!this.muted && this.volume === 0) {
        this.setVolume(0.5);
      }
    }
    try {
      localStorage.setItem(this.MUTED_PREF_KEY, String(this.muted));
    } catch {}
  }

  setVolume(level: number) {
    const video = this.videoRef?.nativeElement;
    this.volume = Math.max(0, Math.min(1, Math.round(level * 100) / 100));
    this.muted = this.volume === 0;
    if (video) {
      video.volume = this.volume;
      video.muted = this.muted;
    }
    try {
      localStorage.setItem(this.VOLUME_PREF_KEY, String(this.volume));
      localStorage.setItem(this.MUTED_PREF_KEY, String(this.muted));
    } catch {}
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
    if (!this.isScrubbing) {
      this.currentTime = (this.streamStartTime || 0) + (video.currentTime || 0);
    }
    const vd = video.duration;
    if (isFinite(vd) && vd > 0) {
      const effectiveDuration = (this.streamStartTime || 0) + vd;
      const isTrailingProgressive = Math.abs(vd - video.currentTime) < 3.0 && video.currentTime > 2.0;
      if (!isTrailingProgressive) {
        if (this.duration === 0 || !isFinite(this.duration) || effectiveDuration > this.duration) {
          this.duration = effectiveDuration;
        }
        if (!this.sourceDuration && effectiveDuration > this.currentTime + 10) {
          this.sourceDuration = effectiveDuration;
        }
      } else if (this.duration === 0 && this.knownDuration > 0) {
        this.duration = this.knownDuration;
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

  // --- Live Timeline Scrubbing & Hover ---

  onSeekHover(event: MouseEvent) {
    const total = this.displayDuration;
    if (!total) return;
    const bar = (event.currentTarget as HTMLElement).querySelector('.hudSeekTrack') as HTMLElement || (event.currentTarget as HTMLElement);
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    this.hoverPosition = ratio * 100;
    this.hoverTime = ratio * total;
    this.showHoverTime = true;
  }

  onSeekHoverEnd() {
    this.showHoverTime = false;
  }

  onSeekStart(event: MouseEvent | TouchEvent) {
    const total = this.displayDuration;
    if (!total) return;
    event.preventDefault();
    this.isScrubbing = true;

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    this.updateScrubFromClientX(clientX);

    const onMove = (e: MouseEvent | TouchEvent) => {
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
      this.updateScrubFromClientX(x);
    };

    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      if (this.isScrubbing) {
        this.isScrubbing = false;
        this.performSeek(this.scrubTime);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  private updateScrubFromClientX(clientX: number) {
    const total = this.displayDuration;
    const bar = this.playerHostRef?.nativeElement?.querySelector('.hudSeekTrack') as HTMLElement;
    if (!bar || !total) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this.scrubTime = ratio * total;
    this.currentTime = this.scrubTime;
    this.hoverPosition = ratio * 100;
    this.hoverTime = this.scrubTime;
    this.showHoverTime = true;
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

    let isBuffered = false;
    if (relTarget >= 0 && video.buffered.length) {
      for (let i = 0; i < video.buffered.length; i++) {
        if (relTarget >= video.buffered.start(i) && relTarget <= video.buffered.end(i)) {
          isBuffered = true;
          break;
        }
      }
    }

    if (video.seekable?.length && relTarget >= 0) {
      for (let i = 0; i < video.seekable.length; i++) {
        if (relTarget >= video.seekable.start(i) && relTarget <= video.seekable.end(i)) {
          try {
            video.currentTime = relTarget;
            this.currentTime = targetTime;
            this.updateActiveSubtitleText();
            return;
          } catch {}
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
    const wasPlaying = !video.paused;

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
      if (wasPlaying) {
        video.play().catch(() => {});
      }
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
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.volume = this.volume;
      video.muted = this.muted;
    }
  }

  onPlayerMouseMove() {
    this.showControls = true;
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
    this.controlsTimeout = setTimeout(() => {
      if (!this.showSubtitleMenu && !this.showEpisodeMenu && !this.showSourcesMenu) {
        this.showControls = false;
      }
    }, 3000);
  }

  onPlayerClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, .subtitleMenu, .episodeMenu, .sourcesMenu, .hudBottom, .hudTop, .subtitleSyncSection, .pauseContent, .downloadPanel, .autoPlayCard')) {
      return;
    }
    this.showControls = !this.showControls;
  }

  onPlayerDoubleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, .subtitleMenu, .episodeMenu, .sourcesMenu, .hudBottom, .hudTop, .subtitleSyncSection, .pauseContent, .downloadPanel, .autoPlayCard')) {
      return;
    }
    const host = this.playerHostRef?.nativeElement || (event.currentTarget as HTMLElement);
    const rect = host.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;

    if (ratio < 0.35) {
      // Left double-tap: Skip backward 10s
      this.skip(-10);
      this.showToast('-10s');
    } else if (ratio > 0.65) {
      // Right double-tap: Skip forward 10s
      this.skip(10);
      this.showToast('+10s');
    } else {
      // Center double-tap: Toggle fullscreen
      this.toggleFullscreen();
    }
  }

  formatTime(s: number): string {
    if (!s || !isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
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
    if (this.isScrubbing) return;
    const key = this.resumeStorageKey;
    if (!key) return;
    const total = this.displayDuration;
    if (!total || !isFinite(total)) return;
    const pos = this.currentTime;
    if (!pos || !isFinite(pos) || pos < 5) return;
    const pct = pos / total;
    localStorage.setItem(key, JSON.stringify({
      position: pos,
      duration: total,
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
    if (this.hasNext) {
      this.startAutoPlayCountdown();
    }
  }

  startAutoPlayCountdown() {
    this.cancelAutoPlay();
    this.autoPlayCountdown = 5;
    this.autoPlayTimer = setInterval(() => {
      this.autoPlayCountdown--;
      if (this.autoPlayCountdown <= 0) {
        this.cancelAutoPlay();
        this.goToNextEpisode();
      }
    }, 1000);
  }

  cancelAutoPlay() {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
    this.autoPlayCountdown = 0;
  }

  private updateMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      const artwork = [];
      if (this.posterUrl) {
        artwork.push({ src: this.posterUrl, sizes: '512x512', type: 'image/jpeg' });
      }
      if (this.backdropUrl) {
        artwork.push({ src: this.backdropUrl, sizes: '1280x720', type: 'image/jpeg' });
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.title || 'Video',
        artist: 'Soulima',
        album: this.info || (this.currentSeason ? `Season ${this.currentSeason} Episode ${this.currentEpisode}` : 'Movie'),
        artwork
      });

      navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('seekbackward', () => this.skip(-10));
      navigator.mediaSession.setActionHandler('seekforward', () => this.skip(10));
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) this.performSeek(details.seekTime);
      });
      if (this.hasPrev) {
        navigator.mediaSession.setActionHandler('previoustrack', () => this.goToPrevEpisode());
      }
      if (this.hasNext) {
        navigator.mediaSession.setActionHandler('nexttrack', () => this.goToNextEpisode());
      }
    } catch {}
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
        this.activeSubtitle?.lang,
        this.subtitleOffset
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
        // keep polling on transient error
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
    this.cancelAutoPlay();
    if (this.downloadPollTimer) { clearInterval(this.downloadPollTimer); this.downloadPollTimer = null; }
    if (this.controlsTimeout) { clearTimeout(this.controlsTimeout); this.controlsTimeout = null; }
    if (this.toastTimeout) { clearTimeout(this.toastTimeout); this.toastTimeout = null; }
    if (this.syncPollTimer) { clearInterval(this.syncPollTimer); this.syncPollTimer = null; }
    if (this.subtitleObjectUrl) { URL.revokeObjectURL(this.subtitleObjectUrl); this.subtitleObjectUrl = null; }
    if (this.stallRecoveryTimer) { clearTimeout(this.stallRecoveryTimer); this.stallRecoveryTimer = null; }
    if (this.seekDebounceTimer) { clearTimeout(this.seekDebounceTimer); this.seekDebounceTimer = null; }
    // Clear Media Session handlers to prevent stale closures after destroy
    try {
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        (navigator.mediaSession as any).metadata = null;
        for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'] as MediaSessionAction[]) {
          try { navigator.mediaSession.setActionHandler(action, null); } catch {}
        }
      }
    } catch {}
    // Remove global debug reference
    if (typeof window !== 'undefined' && (window as any).torrentPlayerComponent === this) {
      delete (window as any).torrentPlayerComponent;
    }
    this.stopStream();
    this.stopResumeTimer();
  }
}
