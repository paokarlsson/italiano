import { Routes } from '@angular/router';
import { activeRoundGuard, deckExistsGuard } from './core/route-guards';

export const routes: Routes = [
  {
    path: '',
    title: 'Italiano · Companion',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'stats',
    title: 'Statistik · Italiano',
    loadComponent: () => import('./pages/stats/stats').then((m) => m.Stats),
  },
  {
    path: 'deck/:deckId',
    canActivate: [deckExistsGuard],
    loadComponent: () => import('./pages/intro/intro').then((m) => m.Intro),
  },
  {
    path: 'deck/:deckId/quiz',
    canActivate: [deckExistsGuard, activeRoundGuard],
    loadComponent: () => import('./pages/quiz/quiz').then((m) => m.Quiz),
  },
  {
    path: 'deck/:deckId/result',
    canActivate: [deckExistsGuard, activeRoundGuard],
    loadComponent: () => import('./pages/result/result').then((m) => m.Result),
  },
  { path: '**', redirectTo: '' },
];
