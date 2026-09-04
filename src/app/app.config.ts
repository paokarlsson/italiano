import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  inject,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { DataService } from './core/data.service';
import { HintService } from './core/hint.service';
import { StatsService } from './core/stats.service';
import { StorageService } from './core/storage.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideAppInitializer(async () => {
      const storage = inject(StorageService);
      const data = inject(DataService);
      const stats = inject(StatsService);
      const hints = inject(HintService);
      await storage.init();
      await Promise.all([data.load(), stats.load(), hints.load()]);
    }),
  ],
};
