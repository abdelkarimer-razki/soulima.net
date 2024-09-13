import { NgModule } from '@angular/core';
import { Exercice2Component } from './exercice2/exercice2.component';
import { RouterModule, Routes } from '@angular/router';
import { MovieComponent } from './movie/movie.component';
import { SeriesComponent } from './series/series.component';
import { TvshowsComponent } from './tvshows/tvshows.component';

const routes: Routes = [
  { path: '', component: Exercice2Component },
  {path:'movie/:id', component: MovieComponent},
  {path:'tvshows', component:TvshowsComponent},
  {path:'serie/:id/:season/:episode', component: SeriesComponent},
  {path:'**', component: Exercice2Component, redirectTo:''},
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true, initialNavigation: 'enabledBlocking' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
