import { NgModule } from '@angular/core';
import { Exercice2Component } from './exercice2/exercice2.component';
import { RouterModule, Routes } from '@angular/router';
import { MovieComponent } from './movie/movie.component';
import { SeriesComponent } from './series/series.component';
import { TvshowsComponent } from './tvshows/tvshows.component';
import { HelloworldComponent } from './helloworld/helloworld.component';

const routes: Routes = [
  { path: '', component: Exercice2Component, data: { animation: 'Home' } },
  { path: 'movie/:id', component: MovieComponent, data: { animation: 'Movie' } },
  { path: 'tvshows', component: TvshowsComponent, data: { animation: 'TvShows' } },
  { path: 'serie/:id/:season/:episode', component: SeriesComponent, data: { animation: 'Series' } },
  { path: 'helloworld', component: HelloworldComponent, data: { animation: 'HelloWorld' } },
  { path: '**', component: Exercice2Component, redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true, initialNavigation: 'enabledBlocking' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }

