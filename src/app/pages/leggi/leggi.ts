import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiService } from '../../core/ai.service';
import { wordPrompt } from '../../core/ai-explain';
import { DataService } from '../../core/data.service';
import { LeggiService } from '../../core/leggi.service';
import { PILLAR_NAMES } from '../../core/profile';
import { shuffle } from '../../core/utils';
import { PillarId, ReadSummary, Token } from '../../models/leggi.models';
import { Perche } from '../../shared/perche';
import { Topbar } from '../../shared/topbar';

interface Option {
  label: string;
  correct: boolean;
}

/** Läs en text: tryck på det du inte ser igenom, svara på en fråga om innehållet. */
@Component({
  selector: 'app-leggi',
  imports: [RouterLink, Topbar, Perche],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leggi.html',
})
export class Leggi {
  /** Från routens :textId. */
  readonly textId = input.required<string>();

  private readonly data = inject(DataService);
  protected readonly leggi = inject(LeggiService);
  protected readonly ai = inject(AiService);

  protected readonly text = computed(() => this.leggi.text(this.textId()) ?? null);
  protected readonly tokens = computed(() => this.leggi.tokens(this.textId()));
  protected readonly step = computed(() => {
    const number = this.leggi.number(this.textId());
    if (number) return `Leggi · ${number} / ${this.leggi.texts().length}`;
    const own = this.leggi.userTexts().find((t) => t.id === this.textId());
    return own?.source === 'paste' ? 'Leggi · din text' : 'Leggi · skriven åt dig';
  });

  /** Ordet som visas i förklaringsrutan. */
  protected readonly selected = signal<Token | null>(null);
  /** Nycklarna som slagits upp under den här läsningen. */
  protected readonly looked = signal<ReadonlySet<string>>(new Set());
  /** Färgar varje ord efter sin pelare. */
  protected readonly skeleton = signal(false);
  protected readonly asking = signal(false);
  protected readonly options = signal<Option[]>([]);
  protected readonly chosen = signal<Option | null>(null);
  protected readonly summary = signal<ReadSummary | null>(null);

  protected readonly pillars = computed(() =>
    this.data.pillars().map((p) => ({
      id: p.pillarId as PillarId,
      title: p.pillarTitle,
      sv: PILLAR_NAMES[p.pillarId as PillarId] ?? '',
    })),
  );

  protected readonly gloss = computed(() => {
    const entry = this.selected()?.entry;
    if (!entry) return null;
    const pillar = this.pillars().find((p) => p.id === entry.p);
    return {
      ...entry,
      form: this.selected()!.text.toLocaleLowerCase('it'),
      pillar: pillar ? `${pillar.title} · ${pillar.sv}` : '',
      deckRef: entry.deck ? (this.data.deck(entry.deck) ?? null) : null,
    };
  });

  /** Frågan till Claude om det valda ordet: formen, meningen och det appen redan sagt. */
  protected readonly why = computed(() => {
    const token = this.selected();
    const text = this.text();
    if (!token?.entry || !text) return null;
    const i = this.tokens().findIndex((sentence) => sentence.includes(token));
    if (i < 0) return null;
    return wordPrompt({
      form: token.text.toLocaleLowerCase('it'),
      sentence: text.sentences[i].it,
      entry: token.entry,
    });
  });

  /** Vart det går härnäst — aldrig tillbaka till samma text. */
  protected readonly nextText = computed(() => {
    const next = this.leggi.next();
    return next && next.id !== this.textId() ? next : null;
  });
  /** Sant när nästa text bör beställas: de inbyggda är slut och en nyckel finns. */
  protected readonly writeNext = computed(() => this.leggi.allRead() && this.ai.hasKey());

  // Uppläsning — bara där webbläsaren faktiskt har en italiensk röst.
  private readonly synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  protected readonly voice = signal<SpeechSynthesisVoice | null>(null);
  protected readonly speaking = signal(false);

  constructor() {
    // Ny text (även via «Nästa text») — börja om från början.
    effect(() => {
      const text = this.text();
      untracked(() => {
        this.stopSpeaking();
        this.selected.set(null);
        this.looked.set(new Set());
        this.asking.set(false);
        this.chosen.set(null);
        this.summary.set(null);
        this.options.set(
          text
            ? shuffle(
                text.question.options.map((label, i) => ({
                  label,
                  correct: i === text.question.answer,
                })),
              )
            : [],
        );
      });
    });

    if (this.synth) {
      const pick = () =>
        this.voice.set(this.synth!.getVoices().find((v) => v.lang.startsWith('it')) ?? null);
      pick();
      this.synth.addEventListener('voiceschanged', pick);
      inject(DestroyRef).onDestroy(() => {
        this.synth!.removeEventListener('voiceschanged', pick);
        this.stopSpeaking();
      });
    }
  }

  /** Visar ordets förklaring. Under läsningen räknas det som ett uppslag. */
  protected lookUp(token: Token): void {
    if (!token.key) return;
    if (this.selected() === token) {
      this.selected.set(null);
      return;
    }
    this.selected.set(token);
    if (!this.summary()) this.looked.update((set) => new Set(set).add(token.key!));
  }

  protected ask(): void {
    this.asking.set(true);
  }

  protected answer(option: Option): void {
    if (this.chosen()) return;
    this.chosen.set(option);
    this.selected.set(null);
    this.summary.set(this.leggi.complete(this.textId(), this.looked()));
  }

  protected toggleSpeech(): void {
    const text = this.text();
    const voice = this.voice();
    if (!this.synth || !text || !voice) return;
    if (this.speaking()) {
      this.stopSpeaking();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.sentences.map((s) => s.it).join(' '));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.85;
    utterance.onend = utterance.onerror = () => this.speaking.set(false);
    this.synth.cancel();
    this.synth.speak(utterance);
    this.speaking.set(true);
  }

  private stopSpeaking(): void {
    this.synth?.cancel();
    this.speaking.set(false);
  }
}
