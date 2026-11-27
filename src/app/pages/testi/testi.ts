import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BOOK_TOPIC_MAX, pagesLeft, plannedCount } from '../../core/ai-book';
import { AiResult, AiService, BookResult } from '../../core/ai.service';
import { coverPrompt } from '../../core/cover';
import { CoverStore } from '../../core/cover-store';
import { GeminiService } from '../../core/gemini.service';
import { StoryStore } from '../../core/story-store';
import { AiError, PASTE_MAX_CHARS } from '../../core/ai-text';
import { LeggiService } from '../../core/leggi.service';
import { level, LEVELS } from '../../core/levels';
import { PILLAR_NAMES } from '../../core/profile';
import { ToastService } from '../../core/toast.service';
import { StoryData, UserText } from '../../models/leggi.models';
import { Topbar } from '../../shared/topbar';

/** Fler texter: beställ en ny text eller gör en egen läsbar. Nyckeln läggs in under Inställningar. */
@Component({
  selector: 'app-testi',
  imports: [RouterLink, Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './testi.html',
})
export class Testi {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly ai = inject(AiService);
  protected readonly leggi = inject(LeggiService);
  protected readonly saga = inject(StoryStore);
  private readonly gemini = inject(GeminiService);
  private readonly covers = inject(CoverStore);

  protected readonly levelCount = LEVELS.length;
  protected readonly pasteMax = PASTE_MAX_CHARS;

  protected readonly topic = signal('');
  protected readonly pasted = signal('');
  protected readonly error = signal('');
  /** Om nästa text ska fortsätta på den senaste — förvalt, så länge det finns en. */
  protected readonly follow = signal(true);
  /** Hur många texter som skrivs på en gång. */
  protected readonly counts = [1, 3, 5] as const;
  protected readonly count = signal<number>(3);
  /** Knappens text: en eller flera, ny berättelse eller nästa del. */
  protected readonly writeLabel = computed(() => {
    const n = this.count();
    const next = !!this.ai.lastPart() && this.follow();
    if (n === 1) return next ? 'Skriv nästa del →' : 'Skriv en text åt mig →';
    return next ? `Skriv nästa ${n} delar →` : `Skriv ${n} texter åt mig →`;
  });

  protected readonly level = computed(() => level(this.leggi.level()));
  protected readonly openCount = computed(() => this.leggi.openWords().length);
  /** Pelaren nästa text görs tät på, som den heter i appen. */
  protected readonly focus = computed(() => {
    const focus = this.ai.focus();
    return focus && PILLAR_NAMES[focus.p];
  });
  /** En egen bok: beställningen, nivån och hur många sidor. */
  protected readonly bookTopic = signal('');
  protected readonly bookTopicMax = BOOK_TOPIC_MAX;
  protected readonly levels = LEVELS;
  /** Nivån boken skrivs på — läsarens tills något annat väljs. */
  private readonly chosenLevel = signal<number | null>(null);
  protected readonly bookLevel = computed(() => level(this.chosenLevel() ?? this.leggi.level()));
  protected readonly bookSizes = [4, 6, 8, 10] as const;
  protected readonly bookPages = signal<number>(6);
  /** Sant när Gemini ritar omslaget till en ny bok av sig själv. */
  protected readonly drawsCover = this.gemini.hasKey;

  /** De egna böckerna, med hur långt de har kommit. */
  protected readonly books = computed(() =>
    this.saga.books().map((book) => {
      const items = this.saga.itemsOf(book);
      return {
        book,
        first: items[0]?.id ?? null,
        written: items.length,
        planned: book.own ? plannedCount(book.own) : items.length,
        left: pagesLeft(book).length,
        read: items.filter((i) => this.leggi.isRead(i.id)).length,
        level: book.own?.level ?? 1,
      };
    }),
  );

  protected setLevel(n: number): void {
    this.chosenLevel.set(n);
  }

  protected readonly tooLong = computed(() => this.pasted().trim().length > PASTE_MAX_CHARS);

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected write(): Promise<void> {
    return this.run(async () => {
      const { results, error } = await this.ai.writeSeries(
        this.topic(),
        this.follow(),
        this.count(),
      );
      if (results.length === 1 && !error) return this.open(results[0]);
      // Flera texter: öppna den första, och säg vad hela serien kostade.
      const cost = results.reduce((n, r) => n + r.cost, 0);
      const missing = results.reduce((n, r) => n + r.missing.length, 0);
      const notes = [`ca $${cost.toFixed(2)}`];
      if (missing) notes.push(`${missing} ord utan uppslag`);
      this.toast.show(`${results.length} texter klara · ${notes.join(' · ')}`);
      if (error) {
        this.error.set(
          `${results.length} av ${this.count()} texter skrevs. Nästa gick inte: ${error.message}`,
        );
        return;
      }
      void this.router.navigate(['/leggi', results[0].text.id]);
    });
  }

  protected gloss(): Promise<void> {
    return this.run(async () => this.open(await this.ai.gloss(this.pasted())));
  }

  protected writeBook(): Promise<void> {
    return this.run(async () => {
      const result = await this.ai.writeBook({
        topic: this.bookTopic(),
        level: this.bookLevel().n,
        pages: this.bookPages(),
      });
      this.bookTopic.set('');
      this.bookDone(result);
    });
  }

  protected continueBook(book: StoryData): Promise<void> {
    return this.run(async () => this.bookDone(await this.ai.continueBook(book.id)));
  }

  protected deleteBook(book: StoryData): void {
    if (confirm(`Ta bort boken «${book.title}»?`)) this.saga.removeBook(book.id);
  }

  /** Säger hur det gick, ritar omslaget om det går, och öppnar bokens första sida. */
  private bookDone(result: BookResult): void {
    const book = this.saga.book(result.id);
    if (!book) return;
    const notes = [`ca $${result.cost.toFixed(2)}`];
    if (result.missing) notes.push(`${result.missing} ord utan uppslag`);
    if (result.error) {
      this.error.set(
        `${result.written} av ${result.planned} sidor i «${book.title}» skrevs. Nästa gick inte: ${result.error.message} Tryck på «Skriv klart» för att fortsätta.`,
      );
      this.toast.show(`«${book.title}» · ${result.written} sidor · ${notes.join(' · ')}`);
    } else {
      this.toast.show(`«${book.title}» är klar · ${notes.join(' · ')}`);
    }
    void this.drawCover(book);
    const first = this.saga.itemsOf(book)[0];
    if (first && !result.error) void this.router.navigate(['/leggi', first.id]);
  }

  /** Gemini ritar ett omslag till en ny bok, om det finns en nyckel och inget omslag än. */
  private async drawCover(book: StoryData): Promise<void> {
    if (!this.gemini.hasKey() || this.covers.url(book.id)) return;
    try {
      const prompt = coverPrompt(this.gemini.template(), book, this.gemini.prompt(book.id));
      const image = await this.gemini.generate(prompt);
      await this.covers.put({ book: book.id, ...image }, false);
    } catch {
      // Omslaget är ett tillägg — det går att rita det under Omslag i stället.
    }
  }

  protected remove(text: UserText): void {
    if (confirm(`Ta bort «${text.title}»?`)) this.leggi.removeUserText(text.id);
  }

  protected sourceLabel(text: UserText): string {
    if (text.source === 'paste') return 'din text';
    const from = text.source === 'shared' ? 'ur biblioteket' : 'skriven åt dig';
    return `${from} · nivå ${text.level}${text.part && text.part > 1 ? ` · del ${text.part}` : ''}`;
  }

  /** Öppnar den nya texten och säger det som är värt att veta om den. */
  private open(result: AiResult): void {
    const notes = [`ca $${result.cost.toFixed(2)}`];
    if (!result.faithful) notes.push('italienskan kan ha ändrats');
    if (result.missing.length) notes.push(`${result.missing.length} ord utan uppslag`);
    this.toast.show(`Klar · ${notes.join(' · ')}`);
    void this.router.navigate(['/leggi', result.text.id]);
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.error.set('');
    try {
      await task();
    } catch (e) {
      this.error.set(e instanceof AiError ? e.message : 'Något gick fel. Försök igen.');
    }
  }
}
