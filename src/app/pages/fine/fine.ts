import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiService } from '../../core/ai.service';
import { CoverStore } from '../../core/cover-store';
import { DriveService } from '../../core/drive.service';
import { LeggiService } from '../../core/leggi.service';
import { LibraryService } from '../../core/library.service';
import { bookSummary, chapterLabel } from '../../core/story';
import { StoryStore } from '../../core/story-store';
import { ToastService } from '../../core/toast.service';
import { Topbar } from '../../shared/topbar';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Fine — baksidan på en bok som är läst: vad den handlade om, hur det gick, läsarens
 * omdöme, och vart man går härnäst — en uppföljare, nästa bok, eller att dela den.
 */
@Component({
  selector: 'app-fine',
  imports: [RouterLink, Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fine.html',
})
export class Fine {
  /** Från routens :storyId. */
  readonly storyId = input.required<string>();

  private readonly saga = inject(StoryStore);
  private readonly leggi = inject(LeggiService);
  private readonly covers = inject(CoverStore);
  private readonly toast = inject(ToastService);
  private readonly drive = inject(DriveService);
  protected readonly library = inject(LibraryService);
  protected readonly ai = inject(AiService);

  protected readonly book = computed(
    () => this.saga.stories().find((s) => s.id === this.storyId()) ?? null,
  );
  protected readonly cover = computed(() => this.covers.url(this.storyId()));
  protected readonly summary = computed(() => {
    const book = this.book();
    return book ? bookSummary(this.saga.itemsOf(book), this.leggi.progress().texts) : null;
  });

  /** «på 3 dagar», «i dag» — hur länge läsningen pågick, när det går att säga. */
  protected readonly span = computed(() => {
    const s = this.summary();
    if (!s?.first || !s.last) return '';
    const days = Math.round((s.last - s.first) / DAY);
    if (days < 1) return 'på en dag';
    return days === 1 ? 'på två dagar' : `på ${days + 1} dagar`;
  });

  /** Det första olästa i boken — för en bok som inte är läst till slut. */
  protected readonly resume = computed(() => {
    const book = this.book();
    if (!book) return null;
    const item = this.saga.itemsOf(book).find((i) => !this.leggi.isRead(i.id));
    if (!item) return null;
    return {
      link: [item.kind === 'page' ? '/leggi' : '/canzone', item.id],
      label: `${chapterLabel(item.chapter)} · ${item.kind === 'page' ? item.page.title : item.song.title}`,
    };
  });

  /** Nästa bok i läsordningen som inte är läst, med länken dit den står. */
  protected readonly nextBook = computed(() => {
    const item = this.leggi.storyNext();
    if (!item || item.story.id === this.storyId()) return null;
    return {
      title: item.story.title,
      link: [item.kind === 'page' ? '/leggi' : '/canzone', item.id],
    };
  });

  /** Sant när boken är en egen som går att publicera härifrån just nu. */
  protected readonly publishable = computed(() => {
    const book = this.book();
    return (
      !!book &&
      this.library.pendingBooks().includes(book) &&
      this.drive.connected() &&
      !!this.drive.folderId()
    );
  });

  // Omdömet: stjärnorna sparas direkt, raden när den lämnas.
  protected readonly review = computed(() => this.saga.review(this.storyId()));
  protected readonly stars = [1, 2, 3, 4, 5] as const;
  protected readonly note = signal<string | null>(null);
  protected readonly noteText = computed(() => this.note() ?? this.review()?.note ?? '');

  protected rate(stars: number): void {
    this.saga.setReview(this.storyId(), stars, this.noteText());
  }

  protected setNote(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  protected saveNote(): void {
    const review = this.review();
    if (review && this.note() !== null) {
      this.saga.setReview(this.storyId(), review.stars, this.note()!);
      this.toast.show('Omdömet är sparat');
    }
  }

  /** Delar att boken är läst: med telefonens delning, annars som en kopierad rad. */
  protected async share(): Promise<void> {
    const book = this.book();
    const s = this.summary();
    if (!book || !s) return;
    const review = this.review();
    const lines = [
      `Ho finito «${book.title}»! 📖`,
      `${s.pages} sidor på italienska, ${s.own} % på egen hand.`,
      ...(review ? [`${'★'.repeat(review.stars)}${'☆'.repeat(5 - review.stars)}`] : []),
      ...(review?.note.trim() ? [`”${review.note.trim()}”`] : []),
    ];
    const text = lines.join('\n');
    const url = document.baseURI;
    try {
      if (navigator.share) {
        await navigator.share({ title: book.title, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      this.toast.show('Kopierat — klistra in var du vill');
    } catch (e) {
      // Att avbryta delningen är inget fel.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      this.toast.show('Det gick inte att dela härifrån');
    }
  }

  protected async publish(): Promise<void> {
    const book = this.book();
    if (!book) return;
    const ok = confirm(
      `Publicera «${book.title}» i biblioteket? Alla som hämtar biblioteket får boken, och den går inte att ta tillbaka.`,
    );
    if (ok && (await this.library.publishBook(book.id))) {
      this.toast.show(`«${book.title}» är publicerad`);
    } else if (ok && this.library.error()) {
      this.toast.show(this.library.error());
    }
  }
}
