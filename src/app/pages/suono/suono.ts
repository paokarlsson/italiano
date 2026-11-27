import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioService } from '../../core/audio.service';
import { AudioStore } from '../../core/audio-store';
import { CLOUD } from '../../core/cloud.config';
import { coverPrompt } from '../../core/cover';
import { CoverStore } from '../../core/cover-store';
import { GeminiError, GeminiService } from '../../core/gemini.service';
import { StoryStore } from '../../core/story-store';
import { StoryData } from '../../models/leggi.models';
import { DriveError, DriveService } from '../../core/drive.service';
import { LibraryService } from '../../core/library.service';
import { ToastService } from '../../core/toast.service';
import { megabytes } from '../../core/utils';
import { VoiceService } from '../../core/voice.service';
import { Topbar } from '../../shared/topbar';

/**
 * Ljud och bibliotek: hämta det som delas ut, läs in med egen röst, rita bokomslag med
 * Gemini, publicera.
 */
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
  protected readonly gemini = inject(GeminiService);
  protected readonly covers = inject(CoverStore);
  protected readonly stories = inject(StoryStore).stories;

  protected readonly megabytes = megabytes;
  protected readonly hasApiKey = !!CLOUD.apiKey;

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** Ungefär vad det kostar att läsa in allt som saknas, i krediter. */
  protected readonly estimate = computed(() =>
    Math.round(this.audio.missingChars() * (this.voice.rate() ?? 1)).toLocaleString('sv-SE'),
  );
  /** Sant när det finns något att publicera. */
  protected readonly hasPending = computed(
    () =>
      this.library.pendingClips() > 0 ||
      this.library.pendingTexts().length > 0 ||
      this.library.pendingBooks().length > 0 ||
      this.library.pendingCovers() > 0,
  );

  /** Boken vars omslag ritas just nu. */
  protected readonly drawing = signal<string | null>(null);
  protected readonly coverError = signal('');

  /** Bokens bildprompt som den står i rutan: läsarens egen, annars bokens. */
  protected promptOf(story: StoryData): string {
    return this.gemini.prompt(story.id) || story.cover || '';
  }

  /** Hela prompten som skickas: mallen, titeln och bokens bildprompt. */
  protected fullPrompt(story: StoryData): string {
    return coverPrompt(this.gemini.template(), story, this.gemini.prompt(story.id));
  }

  protected savePrompt(story: StoryData, event: Event): void {
    this.gemini.setPrompt(story.id, this.valueOf(event), story.cover);
  }

  protected resetPrompt(story: StoryData): void {
    this.gemini.setPrompt(story.id, '');
  }

  /** Ritar ett omslag till boken och lägger det bland omslagen, opublicerat. */
  protected async draw(story: StoryData): Promise<void> {
    if (this.drawing()) return;
    this.coverError.set('');
    this.drawing.set(story.id);
    try {
      const image = await this.gemini.generate(this.fullPrompt(story));
      await this.covers.put({ book: story.id, ...image }, false);
      this.toast.show(`Omslaget till ${story.title} är klart`);
    } catch (e) {
      this.coverError.set(e instanceof GeminiError ? e.message : 'Omslaget gick inte att skapa.');
    } finally {
      this.drawing.set(null);
    }
  }

  constructor() {
    // Förbered listorna, så att tryckningarna inte behöver vänta på dem.
    // Priset per tecken kommer med listan över modeller.
    if (this.voice.hasKey()) void this.voice.refresh().catch(() => undefined);
    void this.library.check();
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
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

  private async run(task: () => Promise<void>): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await task();
    } catch (e) {
      this.error.set(e instanceof DriveError ? e.message : 'Något gick fel. Försök igen.');
    } finally {
      this.busy.set(false);
    }
  }
}
