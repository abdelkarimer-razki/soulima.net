import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { Exercice2Component } from './exercice2/exercice2.component';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import {HttpClientModule } from '@angular/common/http';
import { MovieComponent } from './movie/movie.component';
import { TopMenuComponent } from './top-menu/top-menu.component';
import { SeriesComponent } from './series/series.component';
import { LocationStrategy,HashLocationStrategy } from '@angular/common';
import { PathLocationStrategy } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { TvshowsComponent } from './tvshows/tvshows.component';
import { YouTubePlayerModule } from '@angular/youtube-player';
import { LoadingScreenComponent } from './loading-screen/loading-screen.component';
import { NotifComponent } from './notif/notif.component';
import { TorrentPlayerComponent } from './components/torrent-player/torrent-player.component';
import { PlayerLoaderComponent } from './components/player-loader/player-loader.component';
import { OfflineLibraryComponent } from './offline-library/offline-library.component';
import { OfflinePlayerComponent } from './offline-player/offline-player.component';
import { MoviedbAPIService } from './services/moviedb-api.service';

export function initAppConfig(movieService: MoviedbAPIService) {
  return () => movieService.loadConfig();
}


@NgModule({
  declarations: [
    AppComponent,
    Exercice2Component,
    MovieComponent,
    TopMenuComponent,
    SeriesComponent,
    TvshowsComponent,
    LoadingScreenComponent,
    NotifComponent,
    TorrentPlayerComponent,
    PlayerLoaderComponent,
    OfflineLibraryComponent,
    OfflinePlayerComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    BrowserAnimationsModule,
    HttpClientModule,
    YouTubePlayerModule
  ],
  providers: [
    { provide: LocationStrategy, useClass: PathLocationStrategy },
    {
      provide: APP_INITIALIZER,
      useFactory: initAppConfig,
      deps: [MoviedbAPIService],
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

