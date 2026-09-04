import { inject, Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { pickRandom } from './utils';

const HINT_KEY = 'it_companion_hint_v1';

export const HINT_PHRASES = [
  'En liten kärna av italienskan bär det mesta du faktiskt läser och hör.',
  'De ~500–600 vanligaste orden täcker redan ~80 % av löpande text.',
  'De 1 000 vanligaste orden tar täckningen till ungefär 84 %.',
  'Motorn — genus, plural, verbändelser — ger +8–9 procentenheter gratis.',
  'En böjningsregel låser upp alla former av ett ord på en gång.',
  '80 % av orden är inte 80 % av innebörden — de sista 20 % bär budskapet.',
  'Bekväm egen läsning kräver omkring 98 % ordtäckning.',
  'Tänk på 100 % här som skelettet, inte som flyt.',
  'Fyra pelare, en companion: limmet, reglerna, motorn, orden.',
  'Suffixreglerna är gratis vokabulär: -tion → -zione, -ty → -tà, -ly → -mente.',
  'Tio suffixregler känner igen tusentals ord du aldrig pluggat.',
  'Falska vänner får extra repetition — de riskabla behöver det mest.',
  '«caldo» betyder varm, inte kall. Just därför drillas den.',
  'Passato prossimo eller imperfetto? Bakgrunden i imperfetto, händelsen i passato prossimo.',
  'Ändelsen räcker för att avgöra både person och tempus — därför utelämnas pronomenet.',
  'Missar du en fråga kommer en ny på samma punkt direkt efter.',
  'Varje runda drar nya, blandade exempel — inget hinner bli inaktuellt.',
  'Dina svaga taggar dyker upp automatiskt i Statistik.',
  'Kopiera din statistik rakt in i valfri AI för en personlig studieplan.',
  'Det här är en startplatta, inte hela språket — och det sägs rakt ut.',
] as const;

/** Tipsrutan på startsidan — ett slumpat tips i taget, går att stänga för gott. */
@Injectable({ providedIn: 'root' })
export class HintService {
  private readonly storage = inject(StorageService);

  readonly dismissed = signal(false);
  readonly phrase = signal<string>(pickRandom(HINT_PHRASES));

  async load(): Promise<void> {
    this.dismissed.set((await this.storage.get(HINT_KEY)) === '1');
  }

  /** Slumpar fram ett tips som skiljer sig från det som visas. */
  cycle(): void {
    if (HINT_PHRASES.length < 2) return;
    let next: string;
    do {
      next = pickRandom(HINT_PHRASES);
    } while (next === this.phrase());
    this.phrase.set(next);
  }

  dismiss(): void {
    this.dismissed.set(true);
    void this.storage.set(HINT_KEY, '1');
  }
}
