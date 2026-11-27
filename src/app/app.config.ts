import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  inject,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { AiService } from './core/ai.service';
import { AudioStore } from './core/audio-store';
import { DataService } from './core/data.service';
import { DriveService } from './core/drive.service';
import { HintService } from './core/hint.service';
import { LeggiService } from './core/leggi.service';
import { LibraryService } from './core/library.service';
import { StatsService } from './core/stats.service';
import { StorageService } from './core/storage.service';
import { SupplyService } from './core/supply.service';
import { VoiceService } from './core/voice.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    provideAppInitializer(async () => {
      const storage = inject(StorageService);
      const data = inject(DataService);
      const stats = inject(StatsService);
      const hints = inject(HintService);
      const leggi = inject(LeggiService);
      const ai = inject(AiService);
      const supply = inject(SupplyService);
      const audio = inject(AudioStore);
      const voice = inject(VoiceService);
      const drive = inject(DriveService);
      const library = inject(LibraryService);
      await storage.init();
      await Promise.all([
        data.load(),
        stats.load(),
        hints.load(),
        leggi.load(),
        ai.load(),
        audio.init(),
        voice.load(),
        drive.load(),
        library.load(),
      ]);
      // Först nu vet påfyllningen vad som finns på lager.
      supply.start();
      // Ser efter om biblioteket har något nytt — utan att uppstarten väntar på svaret.
      void library.check();
    }),
  ],
};
