import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiService } from '../../core/ai.service';
import { DataService } from '../../core/data.service';
import { CoverStore } from '../../core/cover-store';
import { DriveService } from '../../core/drive.service';
import { GeminiService } from '../../core/gemini.service';
import { HintService } from '../../core/hint.service';
import { AudioStore } from '../../core/audio-store';
import { LeggiService } from '../../core/leggi.service';
import { level, LEVELS } from '../../core/levels';
import { LibraryService } from '../../core/library.service';
import { recommend } from '../../core/recommend';
import { RIPASSO_MAX } from '../../core/ripasso';
import { StatsService } from '../../core/stats.service';
import { chapterLabel } from '../../core/story';
import { StoryStore } from '../../core/story-store';
import { SupplyService } from '../../core/supply.service';
import { megabytes } from '../../core/utils';
import { VoiceService } from '../../core/voice.service';
import { Lettura, StoryData, UserText } from '../../models/leggi.models';

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
  protected readonly saga = inject(StoryStore);
  protected readonly gemini = inject(GeminiService);
  private readonly covers = inject(CoverStore);

  protected readonly megabytes = megabytes;

  protected readonly pillars = this.data.pillars;

  /**
   * Kortet överst. En oläst text går alltid först — en inbyggd, eller en ur lagret. Är
   * allt läst visar kortet att nästa text skrivs, leder till beställningen, eller — utan
   * nyckel — föreslår en omläsning.
   */
  protected readonly reading = computed(() => {
    const step = this.leggi.step();
    const total = this.leggi.texts().length;
    if (step?.kind === 'song') {
      const item = this.saga.item(step.song.id)!;
      return {
        kind: 'song' as const,
        song: step.song,
        label: `${item.story.title} · ${chapterLabel(item.chapter)} · låten`,
        total,
      };
    }
    const next = step?.text;
    if (!next) return null;
    if (this.saga.page(next.id) && this.supply.pageComing(next.id)) {
      return { kind: 'adapting' as const, total, label: this.label(next, false) };
    }
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
    // I följetongen: scenen på sidan före, så som planen beskriver den.
    const item = this.saga.item(r.text.id);
    if (item) {
      const items = this.saga.itemsOf(item.story);
      const at = items.indexOf(item);
      const before = items
        .slice(0, at)
        .reverse()
        .find((i) => i.kind === 'page');
      return before?.kind === 'page' ? before.page.scene : null;
    }
    const parts = this.leggi.story();
    const i = parts.findIndex((t) => t.id === r.text.id);
    return i > 0 ? (parts[i - 1].recap ?? null) : null;
  });

  /**
   * Följetongen du står i: den som har nästa olästa sida eller låt, annars den sista. Null
   * när ingen finns.
   */
  private readonly currentSaga = computed(() => {
    // En egen bok utan skrivna sidor har inget att visa.
    const stories = this.saga.stories().filter((s) => this.saga.itemsOf(s).length);
    return this.leggi.storyNext()?.story ?? stories.at(-1) ?? null;
  });

  /**
   * Den senaste egna boken som inte är läst till slut — den visas bredvid följetongen du
   * står i, så att en ny bok går att läsa direkt. Null när ingen sådan finns.
   */
  private readonly ownSaga = computed(
    () =>
      this.saga.books().find((b) => this.saga.itemsOf(b).some((i) => !this.leggi.isRead(i.id))) ??
      null,
  );

  /**
   * Följetongerna att visa öppna, som kapitel: den du står i och en påbörjad egen bok, med
   * det du står i öppet, en prick per sida och låt, och de andra kapitlen hopfällda.
   */
  protected readonly sagaViews = computed(() =>
    [...new Set([this.currentSaga(), this.ownSaga()])]
      .filter((s): s is StoryData => !!s)
      .map((s) => this.sagaOf(s)),
  );

  /** De andra följetongerna som är lästa till slut — hopfällda, för den som vill läsa om. */
  protected readonly sagasDone = computed(() =>
    this.saga
      .stories()
      .filter((s) => s !== this.currentSaga() && s !== this.ownSaga())
      .map((s) => this.sagaOf(s))
      .filter((s) => s.read === s.total && s.total > 0),
  );

  private sagaOf(data: StoryData) {
    const isRead = (id: string) => this.leggi.isRead(id);
    const all = this.saga.itemsOf(data);
    const next = all.find((i) => !isRead(i.id)) ?? null;
    const chapters = data.chapters.map((chapter) => {
      const items = [
        ...chapter.pages.map((p) => ({
          id: p.id,
          link: ['/leggi', p.id],
          label: String(p.part),
          title: p.title,
          read: isRead(p.id),
        })),
        ...chapter.songs.map((s) => ({
          id: s.id,
          link: ['/canzone', s.id],
          label: '♪',
          title: s.title,
          read: isRead(s.id),
        })),
      ];
      return {
        n: chapter.n,
        label: chapterLabel(chapter),
        items,
        done: items.every((i) => i.read),
      };
    });
    const current = next ? next.chapter.n : (chapters.at(-1)?.n ?? 0);
    return {
      id: data.id,
      cover: this.covers.url(data.id),
      title: data.title,
      sv: data.sv,
      chapters,
      current: chapters.find((c) => c.n === current)!,
      nextId: next?.id ?? null,
      read: all.filter((i) => isRead(i.id)).length,
      total: all.length,
    };
  }

  /** Länken till Bibliotek: vad som går att göra där, med de nycklar och den inloggning som finns. */
  protected readonly suono = computed(() => {
    const can = [
      this.voice.hasKey() && 'läs in',
      this.gemini.hasKey() && 'rita omslag',
      this.drive.connected() && 'publicera',
    ].filter((x): x is string => !!x);
    if (!can.length) return null;
    const text = can.length > 1 ? `${can.slice(0, -1).join(', ')} och ${can.at(-1)}` : can[0];
    return { title: 'Bibliotek', text };
  });

  /** Grundkursen fälls ihop när den är läst och en berättelse har tagit över. */
  protected readonly basicsDone = computed(
    () => this.leggi.allRead() && (!!this.story() || this.leggi.storyRead() > 0),
  );

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
    const item = this.saga.item(text.id);
    if (item?.kind === 'page') {
      const own = this.saga.adaptation(text.id) ? ' · omskriven åt dig' : '';
      return `${again ? 'Läs om' : 'Leggi'} · ${item.story.title} · ${chapterLabel(item.chapter)}${own}`;
    }
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
