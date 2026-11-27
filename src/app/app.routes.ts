import { Routes } from '@angular/router';
import {
  activeRoundGuard,
  deckExistsGuard,
  songExistsGuard,
  textExistsGuard,
} from './core/route-guards';

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
    path: 'leggi/:textId',
    title: 'Leggi · Italiano',
    canActivate: [textExistsGuard],
    loadComponent: () => import('./pages/leggi/leggi').then((m) => m.Leggi),
  },
  {
    path: 'canzone/:songId',
    title: 'Canzone · Italiano',
    canActivate: [songExistsGuard],
    loadComponent: () => import('./pages/canzone/canzone').then((m) => m.Canzone),
  },
  {
    path: 'ripasso',
    title: 'Ripasso · Italiano',
    loadComponent: () => import('./pages/ripasso/ripasso').then((m) => m.Ripasso),
  },
  {
    path: 'testi',
    title: 'Fler texter · Italiano',
    loadComponent: () => import('./pages/testi/testi').then((m) => m.Testi),
  },
  {
    path: 'installningar',
    title: 'Inställningar · Italiano',
    loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
  },
  {
    path: 'suono',
    title: 'Ljud · Italiano',
    loadComponent: () => import('./pages/suono/suono').then((m) => m.Suono),
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
