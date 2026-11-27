import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiService } from '../../core/ai.service';
import { DataService } from '../../core/data.service';
import { DriveService } from '../../core/drive.service';
import { HintService } from '../../core/hint.service';
import { AudioStore } from '../../core/audio-store';
import { LeggiService } from '../../core/leggi.service';
import { level, LEVELS } from '../../core/levels';
import { LibraryService } from '../../core/library.service';
import { recommend } from '../../core/recommend';
import { RIPASSO_MAX } from '../../core/ripasso';
import { StatsService } from '../../core/stats.service';
import { SupplyService } from '../../core/supply.service';
import { megabytes } from '../../core/utils';
import { VoiceService } from '../../core/voice.service';
import { Lettura, UserText } from '../../models/leggi.models';

/** Så många lästa delar som syns före den du står på, och hur många delar fönstret rymmer. */
const STORY_BEHIND = 2;
const STORY_WINDOW = 7;

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
})
export class Home {
  private readonly data = inject(DataService);
  protected readonly stats = inject(StatsService);
  protected readonly hints = inject(HintService);
  protected readonly leggi = inject(LeggiService);
  protected readonly ai = inject(AiService);
  protected readonly supply = inject(SupplyService);
  protected readonly library = inject(LibraryService);
  protected readonly audio = inject(AudioStore);
  protected readonly voice = inject(VoiceService);
  protected readonly drive = inject(DriveService);

  protected readonly megabytes = megabytes;

  protected readonly pillars = this.data.pillars;

  /**
   * Kortet överst. En oläst text går alltid först — en inbyggd, eller en ur lagret. Är
   * allt läst visar kortet att nästa text skrivs, leder till beställningen, eller — utan
   * nyckel — föreslår en omläsning.
   */
  protected readonly reading = computed(() => {
    const next = this.leggi.next();
    if (!next) return null;
    const total = this.leggi.texts().length;
    const text = (again: boolean) => ({
      kind: 'text' as const,
      text: next,
      label: this.label(next, again),
      total,
    });
    if (!this.leggi.isRead(next.id)) return text(false);
    if (this.supply.textComing()) return { kind: 'coming' as const, total };
    if (this.ai.hasKey()) return { kind: 'write' as const, total };
    return text(true);
  });

  /**
   * Berättelsen som ett fönster, inte en hel rad: de två senast lästa delarna, den du står
   * på, och det som ligger färdigt efter den. Null innan någon del finns.
   */
  protected readonly story = computed(() => {
    const parts = this.leggi.story();
    if (!parts.length) return null;
    const read = (t: UserText) => this.leggi.isRead(t.id);
    const first = parts.findIndex((t) => !read(t));
    // Är allt läst står du efter den sista.
    const at = first < 0 ? parts.length : first;
    const from = Math.max(0, at - STORY_BEHIND);
    const items = parts.slice(from, from + STORY_WINDOW).map((t, k) => ({
      id: t.id,
      n: t.part ?? from + k + 1,
      title: t.title,
      state: read(t) ? 'read' : from + k === at ? 'current' : 'stock',
    }));
    const last = parts[parts.length - 1];
    return {
      items,
      /** Delarna utanför fönstret. */
      before: from,
      after: parts.length - from - items.length,
      /** Numret nästa del får, när den skrivs. */
      next: (last.part ?? parts.length) + 1,
      read: parts.filter(read).length,
      total: parts.length,
    };
  });

  /**
   * Sammanfattningen av förra delen, när kortet visar en del i berättelsen. Claude skrev
   * den för att kunna fortsätta — här påminner den om var man var.
   */
  protected readonly recap = computed(() => {
    const r = this.reading();
    if (r?.kind !== 'text') return null;
    const parts = this.leggi.story();
    const i = parts.findIndex((t) => t.id === r.text.id);
    return i > 0 ? (parts[i - 1].recap ?? null) : null;
  });

  /** Grundkursen fälls ihop när den är läst och berättelsen har tagit över. */
  protected readonly basicsDone = computed(() => this.leggi.allRead() && !!this.story());

  protected readonly level = computed(() => level(this.leggi.level()));
  protected readonly levelCount = LEVELS.length;

  /** Mazzin värda att satsa på, viktigast först. */
  protected readonly advice = computed(() =>
    recommend({
      pillars: this.pillars(),
      lookups: this.leggi.profile().decks,
      stats: this.stats.stats(),
    }),
  );

  /** Antal frågor en repetition skulle få just nu — 0 när inget skaver. */
  protected readonly ripasso = computed(() =>
    Math.min(
      RIPASSO_MAX,
      this.leggi.openWords().length + Math.min(2, this.stats.weakTags().length),
    ),
  );

  private label(text: Lettura, again: boolean): string {
    const number = this.leggi.number(text.id);
    if (number) {
      return `${again ? 'Läs om' : 'Leggi'} · text ${number} av ${this.leggi.texts().length}`;
    }
    const { part, source } = text as UserText;
    const from = source === 'shared' ? 'ur biblioteket' : 'skriven åt dig';
    return `Leggi · ${from}${part && part > 1 ? ` · del ${part}` : ''}`;
  }

  protected doneInPillar(pillarIndex: number): number {
    const done = this.stats.stats().deckDone;
    return this.pillars()[pillarIndex].decks.filter((d) => done[d.deckId]).length;
  }

  protected confirmReset(): void {
    if (confirm('Radera alla sparade framsteg och all statistik? Det går inte att ångra.')) {
      this.stats.reset();
      this.leggi.reset();
      this.hints.restore();
    }
  }
}
