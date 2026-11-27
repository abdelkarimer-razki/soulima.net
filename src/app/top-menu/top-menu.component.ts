import { Component, Input, Output, EventEmitter, HostListener, OnInit, OnDestroy } from '@angular/core';
import { TorrentService, ActiveDownloadItem } from '../services/torrent.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-top-menu',
  templateUrl: './top-menu.component.html',
  styleUrls: ['./top-menu.component.css']
})
export class TopMenuComponent implements OnInit, OnDestroy {
  @Input() searchQuery = '';
  @Input() ghostText = '';
  @Input() autocompleteTitle = '';
  @Input() placeholder = 'Search for movies or series...';
  @Input() showSearch = true;

  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() applyAutocomplete = new EventEmitter<string>();
  @Output() clearGenre = new EventEmitter<void>();

  isScrolled = false;
  mobileSearchOpen = false;

  activeDownloads$: Observable<ActiveDownloadItem[]>;
  private pollSub: any = null;

  constructor(public torrentService: TorrentService) {
    this.activeDownloads$ = this.torrentService.activeDownloads$;
  }

  ngOnInit() {
    this.torrentService.getActiveDownloads();
    this.pollSub = setInterval(() => {
      if (this.torrentService.activeDownloads$.value.length > 0) {
        this.torrentService.getActiveDownloads();
      }
    }, 4000);
  }

  ngOnDestroy() {
    if (this.pollSub) {
      clearInterval(this.pollSub);
      this.pollSub = null;
    }
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    if (typeof window !== 'undefined') {
      this.isScrolled = window.scrollY > 20;
    }
  }

  onInput(val: string) {
    this.searchQuery = val;
    this.searchQueryChange.emit(val);
    this.searchChange.emit(val);
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Tab' && this.autocompleteTitle) {
      event.preventDefault();
      this.applySuggestion(this.autocompleteTitle);
    }
  }

  applySuggestion(title: string) {
    this.searchQuery = title;
    this.searchQueryChange.emit(title);
    this.applyAutocomplete.emit(title);
    this.searchChange.emit(title);
  }

  onLogoClick() {
    this.searchQuery = '';
    this.searchQueryChange.emit('');
    this.searchChange.emit('');
    this.clearGenre.emit();
  }

  toggleMobileSearch() {
    this.mobileSearchOpen = !this.mobileSearchOpen;
  }
}
