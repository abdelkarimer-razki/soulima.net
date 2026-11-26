import { NgModule } from '@angular/core';
import { Exercice2Component } from './exercice2/exercice2.component';
import { RouterModule, Routes } from '@angular/router';
import { MovieComponent } from './movie/movie.component';
import { SeriesComponent } from './series/series.component';
import { TvshowsComponent } from './tvshows/tvshows.component';
import { OfflineLibraryComponent } from './offline-library/offline-library.component';
import { OfflinePlayerComponent } from './offline-player/offline-player.component';

const routes: Routes = [
  { path: '', component: Exercice2Component, data: { animation: 'Home' } },
  { path: 'movie/:id', component: MovieComponent, data: { animation: 'Movie' } },
  { path: 'tvshows', redirectTo: '/?filter=series', pathMatch: 'full' },
  { path: 'serie/:id/:season/:episode', component: SeriesComponent, data: { animation: 'Series' } },
  { path: 'downloads', component: OfflineLibraryComponent, data: { animation: 'Downloads' } },
  { path: 'downloads/:id', component: OfflinePlayerComponent, data: { animation: 'Downloads' } },
  { path: 'helloworld', redirectTo: '', pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { initialNavigation: 'enabledBlocking' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }


