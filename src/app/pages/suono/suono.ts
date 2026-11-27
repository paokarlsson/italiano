import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioService } from '../../core/audio.service';
import { AudioStore } from '../../core/audio-store';
import { CLOUD } from '../../core/cloud.config';
import { DriveError, DriveService } from '../../core/drive.service';
import { LibraryService } from '../../core/library.service';
import { ToastService } from '../../core/toast.service';
import { megabytes } from '../../core/utils';
import { VoiceError, VoiceService } from '../../core/voice.service';
import { Topbar } from '../../shared/topbar';

/** Ljud och bibliotek: hämta det som delas ut, läs in med egen röst, publicera. */
@Component({
  selector: 'app-suono',
  imports: [RouterLink, Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suono.html',
})
export class Suono {
  private readonly toast = inject(ToastService);
  protected readonly audio = inject(AudioService);
  protected readonly store = inject(AudioStore);
  protected readonly voice = inject(VoiceService);
  protected readonly drive = inject(DriveService);
  protected readonly library = inject(LibraryService);

  protected readonly megabytes = megabytes;
  protected readonly hasApiKey = !!CLOUD.apiKey;

  protected readonly key = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** Antal tecken i det som saknar ljud — det ElevenLabs räknar förbrukning i. */
  protected readonly missingChars = computed(() =>
    this.audio.missing().reduce((n, t) => n + t.length, 0),
  );
  /** Sant när det finns något att publicera. */
  protected readonly hasPending = computed(
    () => this.library.pendingClips() > 0 || this.library.pendingTexts().length > 0,
  );

  constructor() {
    // Förbered inloggningen och listorna, så att tryckningarna inte behöver vänta på dem.
    if (this.drive.canConnect) void this.drive.prepare().catch(() => undefined);
    if (this.voice.hasKey()) void this.voice.refresh().catch(() => undefined);
    void this.library.check();
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected saveKey(): Promise<void> {
    return this.run(async () => {
      await this.voice.saveKey(this.key());
      this.key.set('');
      this.toast.show('Nyckeln är sparad');
    });
  }

  protected removeKey(): void {
    if (confirm('Ta bort ElevenLabs-nyckeln från den här webbläsaren? Ljudet ligger kvar.')) {
      this.voice.clearKey();
    }
  }

  protected connect(): Promise<void> {
    return this.run(async () => {
      await this.drive.connect();
      await this.library.check();
    });
  }

  protected createFolder(): Promise<void> {
    return this.run(async () => {
      await this.drive.createFolder();
      await this.library.check();
      this.toast.show('Mappen är skapad');
    });
  }

  protected async publish(): Promise<void> {
    const n = await this.library.publish();
    if (n) this.toast.show(n === 1 ? 'Ett paket publicerat' : `${n} paket publicerade`);
  }

  protected async copyFolderId(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.drive.folderId());
      this.toast.show('Mappens id är kopierat');
    } catch {
      this.toast.show('Kunde inte kopiera — markera id:t för hand');
    }
  }

  protected async clear(): Promise<void> {
    if (
      confirm('Ta bort allt ljud ur den här webbläsaren? Det går att hämta eller läsa in igen.')
    ) {
      this.audio.stop();
      await this.store.clear();
    }
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await task();
    } catch (e) {
      this.error.set(
        e instanceof VoiceError || e instanceof DriveError
          ? e.message
          : 'Något gick fel. Försök igen.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
