import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AI_MODELS, AiModel, AiService } from '../../core/ai.service';
import { AiError } from '../../core/ai-text';
import { AudioService } from '../../core/audio.service';
import { AudioStore } from '../../core/audio-store';
import { DataService } from '../../core/data.service';
import { DriveError, DriveService } from '../../core/drive.service';
import { LibraryService } from '../../core/library.service';
import { STOCK_TARGET, SupplyService } from '../../core/supply.service';
import { ToastService } from '../../core/toast.service';
import { megabytes } from '../../core/utils';
import { Permission, VoiceError, VoiceService } from '../../core/voice.service';
import { Voice } from '../../models/leggi.models';
import { Topbar } from '../../shared/topbar';

/** Vad appen använder varje behörighet till. */
const PERMISSION_USE: Record<Permission, string> = {
  voices_read: 'röstlistan, så att Samanta och Daniele kan väljas',
  models_read: 'modellerna och priset per tecken',
  user_read: 'kontots krediter den här perioden',
};

/** Krediter som heltal med mellanrum: «12 480». */
const credits = (n: number) => Math.round(n).toLocaleString('sv-SE');

/** Inställningar: nycklarna, modellen, rösterna och vad allt har kostat. */
@Component({
  selector: 'app-settings',
  imports: [RouterLink, Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.html',
})
export class Settings {
  private readonly toast = inject(ToastService);
  protected readonly ai = inject(AiService);
  protected readonly data = inject(DataService);
  protected readonly supply = inject(SupplyService);
  protected readonly voice = inject(VoiceService);
  protected readonly audio = inject(AudioService);
  protected readonly store = inject(AudioStore);
  protected readonly drive = inject(DriveService);
  protected readonly library = inject(LibraryService);
  protected readonly megabytes = megabytes;

  protected readonly models = AI_MODELS;
  protected readonly stockTarget = STOCK_TARGET;
  protected readonly credits = credits;
  /** Krediter per tecken med decimalkomma: «0,5». */
  protected readonly perChar = (rate: number) => String(rate).replace('.', ',');
  protected readonly roles: { id: Voice; label: string }[] = [
    { id: 'f', label: 'Kvinnlig röst' },
    { id: 'm', label: 'Manlig röst' },
  ];

  protected readonly claudeKey = signal('');
  protected readonly voiceKey = signal('');
  protected readonly busy = signal(false);
  protected readonly claudeError = signal('');
  protected readonly voiceError = signal('');
  protected readonly googleError = signal('');

  /**
   * Google-inloggningen behövs bara för att publicera. Den visas när det finns något att
   * publicera, när mappen inte är skapad än, eller när man redan är inloggad — en besökare
   * som bara läser ser den aldrig.
   */
  protected readonly showGoogle = computed(
    () =>
      this.drive.canConnect &&
      (this.drive.connected() ||
        !this.drive.folderId() ||
        this.library.pendingClips() > 0 ||
        this.library.pendingTexts().length > 0),
  );

  /** Ungefär vad det kostar att läsa in allt som saknas, i krediter. */
  protected readonly estimate = computed(
    () => this.audio.missingChars() * (this.voice.rate() ?? 1),
  );
  /** När kontots räkning börjar om, som datum. */
  protected readonly resets = computed(() => {
    const at = this.voice.account()?.resets;
    return at ? new Date(at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' }) : '';
  });
  /** Behörigheterna nyckeln saknar, med vad de används till. */
  protected readonly missing = computed(() =>
    this.voice.missing().map((p) => ({ id: p, use: PERMISSION_USE[p] })),
  );

  /** Sant när den valda rösten inte finns bland kontots röster. */
  protected readonly missingVoice = computed(
    () =>
      this.voice.voices().length > 0 &&
      this.roles.some((r) => !this.voice.voices().some((v) => v.id === this.voice.voiceId(r.id))),
  );

  constructor() {
    // Ladda inloggningen i förväg, så att tryckningen kan öppna popupen direkt.
    if (this.showGoogle()) void this.drive.prepare().catch(() => undefined);
    if (this.voice.hasKey()) {
      void this.voice.refresh().catch((e) => this.voiceError.set(message(e)));
    }
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected saveClaudeKey(): Promise<void> {
    return this.run(this.claudeError, async () => {
      await this.ai.saveKey(this.claudeKey());
      this.supply.retry();
      this.claudeKey.set('');
      this.toast.show('Nyckeln är sparad');
    });
  }

  protected removeClaudeKey(): void {
    if (confirm('Ta bort Claude-nyckeln från den här webbläsaren? Dina texter ligger kvar.')) {
      this.ai.clearKey();
    }
  }

  protected setModel(event: Event): void {
    this.ai.setModel(this.valueOf(event) as AiModel);
  }

  protected toggleAuto(): void {
    this.ai.setAuto(!this.ai.auto());
    this.supply.retry();
  }

  protected removeExtras(): void {
    const n = this.data.extraCount();
    if (confirm(`Ta bort de ${n} frågor som Claude har skrivit till i gymmet?`)) {
      this.data.clearExtras();
    }
  }

  protected saveVoiceKey(): Promise<void> {
    return this.run(this.voiceError, async () => {
      await this.voice.saveKey(this.voiceKey());
      this.voiceKey.set('');
      this.toast.show('Nyckeln är sparad');
    });
  }

  protected removeVoiceKey(): void {
    if (confirm('Ta bort ElevenLabs-nyckeln från den här webbläsaren? Ljudet ligger kvar.')) {
      this.voice.clearKey();
    }
  }

  /** Sätter en röst från ett inklistrat röst-ID — när röstlistan inte går att läsa. */
  protected setVoiceId(role: Voice, event: Event): void {
    const id = this.valueOf(event).trim();
    if (id && id !== this.voice.voiceId(role)) this.voice.setVoice(role, id);
  }

  protected refreshVoices(): Promise<void> {
    return this.run(this.voiceError, () => this.voice.refresh());
  }

  protected resetCount(): void {
    if (confirm('Nollställ räkningen av det som lästs in härifrån? Kontot påverkas inte.')) {
      this.voice.resetCount();
    }
  }

  protected connectGoogle(): Promise<void> {
    return this.run(this.googleError, async () => {
      await this.drive.connect();
      await this.library.check();
      this.toast.show('Inloggad med Google');
    });
  }

  protected async clearAudio(): Promise<void> {
    if (confirm('Ta bort allt ljud ur den här webbläsaren? Det hämtas eller läses in igen.')) {
      this.audio.stop();
      await this.store.clear();
    }
  }

  private async run(error: typeof this.claudeError, task: () => Promise<void>): Promise<void> {
    error.set('');
    this.busy.set(true);
    try {
      await task();
    } catch (e) {
      error.set(message(e));
    } finally {
      this.busy.set(false);
    }
  }
}

function message(e: unknown): string {
  return e instanceof AiError || e instanceof VoiceError
    ? e.message
    : 'Något gick fel. Försök igen.';
}
