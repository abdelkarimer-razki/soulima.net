import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-custom-player',
  templateUrl: './custom-player.component.html',
  styleUrls: ['./custom-player.component.css']
})
export class CustomPlayerComponent {
  @Input() iframeSrc?: SafeResourceUrl;
  @Input() title: string = 'Video Player';
  @Output() iframeError = new EventEmitter<void>();
}
