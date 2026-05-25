import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-loading-screen',
  templateUrl: './loading-screen.component.html',
  styleUrls: ['./loading-screen.component.css']
})
export class LoadingScreenComponent implements OnInit, OnDestroy {

  private preventScroll = (e: TouchEvent) => {
    e.preventDefault();
  };

  ngOnInit() {
    // Lock scrolling on document and body
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Prevent touch scrolling on mobile devices
    document.addEventListener('touchmove', this.preventScroll, { passive: false });
  }

  ngOnDestroy() {
    // Remove scroll locks
    document.body.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('overflow');
    
    // Clean up touch event listener
    document.removeEventListener('touchmove', this.preventScroll);
  }
}
