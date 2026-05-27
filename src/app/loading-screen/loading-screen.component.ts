import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-loading-screen',
  templateUrl: './loading-screen.component.html',
  styleUrls: ['./loading-screen.component.css']
})
export class LoadingScreenComponent implements OnInit, OnDestroy {
  private _isLoaded = false;

  @Input()
  get isLoaded(): boolean {
    return this._isLoaded;
  }

  set isLoaded(value: boolean) {
    const wasLoaded = this._isLoaded;
    this._isLoaded = value;
    if (value && !wasLoaded) {
      this.triggerAutoDismiss();
    }
  }

  @Output() dismiss = new EventEmitter<void>();

  isZooming = false;

  private preventScroll = (e: TouchEvent) => {
    e.preventDefault();
  };

  ngOnInit() {
    // Lock scrolling on document and body
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Prevent touch scrolling on mobile devices
    document.addEventListener('touchmove', this.preventScroll, { passive: false });

    // Fallback: If isLoaded is already true when component is initialized
    if (this._isLoaded) {
      this.triggerAutoDismiss();
    }
  }

  triggerAutoDismiss() {
    if (this.isZooming) return;
    
    // Wait 800ms delay to let the clapperboard settle/loaded state show beautifully
    setTimeout(() => {
      this.isZooming = true;
      // Wait for the zoom animation (800ms) to complete, then emit dismiss to remove from DOM
      setTimeout(() => {
        this.dismiss.emit();
      }, 800);
    }, 800);
  }

  ngOnDestroy() {
    // Remove scroll locks
    document.body.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('overflow');
    
    // Clean up touch event listener
    document.removeEventListener('touchmove', this.preventScroll);
  }
}
