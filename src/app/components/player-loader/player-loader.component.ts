import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-player-loader',
  templateUrl: './player-loader.component.html',
  styleUrls: ['./player-loader.component.css']
})
export class PlayerLoaderComponent {
  @Input() title: string = '';
  @Input() info: string = '';
  @Input() overview: string = '';
  @Input() backdropUrl: string = '';
  @Input() posterUrl: string = '';
  @Input() status: string = 'Loading…';
  @Input() progress = 0;
  @Input() showProgress = false;
}
