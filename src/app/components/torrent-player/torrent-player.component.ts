import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges, ViewChild, ElementRef, HostListener } from '@angular/core';
import { TorrentService, TorrentSource } from '../../services/torrent.service';
import { SubtitleService, SubtitleTrack } from '../../services/subtitle.service';

@Component({
  selector: 'app-torrent-player',
  templateUrl: './torrent-player.component.html',
  styleUrls: ['./torrent-player.component.css']
})
export class TorrentPlayerComponent implements OnChanges, OnDestroy {
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

  @Output() prevEpisode = new EventEmitter<void>();
  @Output() nextEpisode = new EventEmitter<void>();
  @Output() selectEpisode = new EventEmitter<number>();
  @Output() selectSeason = new EventEmitter<number>();
  @Output() unplayable = new EventEmitter<void>();

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

  private currentStreamId: string | null = null;
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
  private static readonly STALL_TIMEOUT = 25000;
  private readonly SUBTITLE_PREF_KEY = 'soulima_subtitle_lang';

  constructor(
    private torrentService: TorrentService,
    private subtitleService: SubtitleService,
  ) {}

  get bufferedRatio(): number {
    return this.duration ? (this.bufferedTime / this.duration) * 100 : 0;
  }

  get playedRatio(): number {
    return this.duration ? (this.currentTime / this.duration) * 100 : 0;
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
    const video = this.videoRef?.nativeElement;
    if (!video || !this.duration) return;
    video.currentTime = Math.max(0, Math.min(this.duration, video.currentTime + seconds));
    this.onTimeUpdate();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['sources'] && this.sources?.length) {
      if (!this.selectedSource || !this.sources.includes(this.selectedSource)) {
        this.triedSources.clear();
        this.selectedSource = this.pickBestSource(this.sources);
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
    this.showEpisodeMenu = false;
    this.showSeasonDropdown = false;

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
    this.duration = 0;
    this.bufferedTime = 0;
    this.activeSubtitleText = '';
    this.parsedCues = [];

    this.selectEpisode.emit(episodeNumber);
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

    this.subtitleService.getSubtitleText(fileId, streamId).then(text => {
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
    this.duration = 0;
    this.bufferedTime = 0;
    this.lastDownloaded = 0;
    this.lastProgressAt = Date.now();

    const video = this.videoRef?.nativeElement;
    if (video) {
      video.removeAttribute('src');
      video.load();
    }

    try {
      const info = await this.torrentService.requestStream(this.selectedSource.magnet);
      if (seq !== this.streamSeq) {
        this.torrentService.stopStream(info.id);
        return;
      }
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
          this.tryNextSource();
        } else if (!this.ready) {
          if (p.downloaded > this.lastDownloaded) {
            this.lastDownloaded = p.downloaded;
            this.lastProgressAt = Date.now();
          } else if (Date.now() - this.lastProgressAt > TorrentPlayerComponent.STALL_TIMEOUT) {
            this.tryNextSource();
          }
        }
      });

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

  handleVideoError() {
    this.loading = false;
    this.tryNextSource();
  }

  onCanPlay() {
    this.loading = false;
    this.ready = true;
    this.error = null;
    this.videoRef?.nativeElement.play().catch(() => {});
  }

  private stopStream() {
    if (this.stallWatcher) { clearInterval(this.stallWatcher); this.stallWatcher = null; }
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
    this.currentTime = video.currentTime || 0;
    this.duration = video.duration || 0;
    if (video.buffered.length) {
      let currentBuf = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
          currentBuf = video.buffered.end(i);
          break;
        }
      }
      this.bufferedTime = currentBuf || video.buffered.end(video.buffered.length - 1);
    }
    this.updateActiveSubtitleText();
  }

  seekTo(event: MouseEvent) {
    if (!this.duration) return;
    const bar = (event.currentTarget as HTMLElement).querySelector('.hudSeekTrack');
    const rect = bar!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const video = this.videoRef?.nativeElement;
    if (video) {
      this.currentTime = ratio * this.duration;
      video.currentTime = this.currentTime;
      this.updateActiveSubtitleText();
    }
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

  onPlayerMouseMove() {
    this.showControls = true;
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
    this.controlsTimeout = setTimeout(() => this.showControls = false, 3000);
  }

  onPlayerClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, .subtitleMenu, .episodeMenu, .hudBottom, .hudTop, .subtitleSyncSection, .pauseContent')) {
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

  download() {
    if (this.currentStreamId) {
      let url = this.torrentService.getDownloadUrl(this.currentStreamId);
      if (this.activeSubtitle) {
        url += `?subtitle=${encodeURIComponent(this.activeSubtitle.fileId)}&lang=${encodeURIComponent(this.activeSubtitle.lang)}`;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (this.selectedSource?.magnet) {
      window.open(this.selectedSource.magnet, '_blank');
    }
  }

  ngOnDestroy() {
    this.stopStream();
  }
}
