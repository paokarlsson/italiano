import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LettureData, UserText, Voice } from '../models/leggi.models';
import { AudioService } from './audio.service';
import { AudioStore } from './audio-store';
import { LeggiService } from './leggi.service';
import { VoiceError, VoiceService } from './voice.service';

const data: LettureData = {
  names: ['marco'],
  lexicon: {
    ciao: { p: 'D4', sv: 'hej' },
    "l'": { p: 'D1', sv: 'artikel' },
    amico: { p: 'D4', sv: 'vän' },
    dice: { p: 'D3', sv: 'säger' },
  },
  texts: [
    {
      id: 'uno',
      title: 'uno',
      sv: '',
      nota: '',
      level: 1,
      narrator: 'f',
      sentences: [
        { it: "Ciao, l'amico!", sv: '' },
        { it: '«Ciao!» dice Marco.', sv: '', speakers: ['m'] },
      ],
      question: { sv: '?', options: ['a', 'b'], answer: 0 },
    },
  ],
};

class FakeVoice {
  ok = true;
  spoken: string[] = [];
  fail = false;
  ready(): boolean {
    return this.ok;
  }
  tag(voice: Voice): string {
    return `${voice}:mia/m`;
  }
  async speak(text: string, voice: Voice): Promise<Uint8Array> {
    this.spoken.push(`${voice} ${text}`);
    await Promise.resolve();
    if (this.fail) throw new VoiceError('Slut på krediter.');
    return new TextEncoder().encode(`${voice} ${text}`);
  }
  async checkAccount(): Promise<void> {}
}

describe('AudioService', () => {
  let audio: AudioService;
  let store: AudioStore;
  let voice: FakeVoice;
  const read = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: VoiceService, useClass: FakeVoice }],
    });
    TestBed.inject(LeggiService).hydrate(data);
    store = TestBed.inject(AudioStore);
    voice = TestBed.inject(VoiceService) as unknown as FakeVoice;
    audio = TestBed.inject(AudioService);
  });

  it('vill ha berättaren, replikerna med sin röst och orden — utom det som inte går att säga', () => {
    const wanted = audio.wanted().map((p) => `${p.voice} ${p.text}`);
    expect(wanted.sort()).toEqual(
      ["f Ciao, l'amico!", 'm Ciao!', 'f dice Marco.', 'f ciao', 'f amico', 'f dice'].sort(),
    );
    const own: UserText = {
      ...data.texts[0],
      id: 'ai-1',
      source: 'ai',
      createdAt: 1,
      narrator: 'm',
      sentences: [{ it: 'Buongiorno.', sv: '' }],
      lexicon: { buongiorno: { p: 'D4', sv: 'god dag' } },
    };
    TestBed.inject(LeggiService).addUserText(own);
    expect(audio.wanted()).toContainEqual({ text: 'Buongiorno.', voice: 'm' });
    expect(audio.wanted()).toContainEqual({ text: 'buongiorno', voice: 'f' });
  });

  it('läser in det som saknas med rätt röst, och aldrig samma två gånger', async () => {
    expect(read(await audio.clip('  Ciao! ', 'm'))).toBe('m Ciao!');
    expect(read(await audio.clip('Ciao!', 'm'))).toBe('m Ciao!');
    // Samma text med den andra rösten är ett annat klipp.
    expect(read(await audio.clip('Ciao!', 'f'))).toBe('f Ciao!');
    // Två som frågar samtidigt delar på en inläsning.
    await Promise.all([audio.clip('amico', 'f'), audio.clip('amico', 'f')]);
    expect(voice.spoken).toEqual(['m Ciao!', 'f Ciao!', 'f amico']);
    expect(store.pending('f:mia/m')).toBe(2);
    expect(store.pending('m:mia/m')).toBe(1);
  });

  it('tar ett klipp ur biblioteket före en egen inläsning, men bara med rätt sorts röst', async () => {
    await store.put('m:daniele/x', [{ text: 'Ciao!', bytes: new Uint8Array([7]) }], true);
    expect(await audio.clip('Ciao!', 'm')).toEqual(new Uint8Array([7]));
    expect(voice.spoken).toEqual([]);
    // Den manliga rösten duger inte där en kvinna talar.
    voice.ok = false;
    expect(audio.can({ text: 'Ciao!', voice: 'm' })).toBe(true);
    expect(audio.can({ text: 'Ciao!', voice: 'f' })).toBe(false);
    expect(await audio.clip('Ciao!', 'f')).toBeNull();
    // Finns både ett eget och ett hämtat går det egna före.
    await store.put('m:mia/m', [{ text: 'Ciao!', bytes: new Uint8Array([9]) }], false);
    expect(await audio.clip('Ciao!', 'm')).toEqual(new Uint8Array([9]));
  });

  it('läser in allt som saknas, räknar tecknen och stannar vid första felet', async () => {
    expect(audio.missingChars()).toBe(
      "Ciao, l'amico!".length + 'Ciao!'.length + 'dice Marco.'.length + 4 + 5 + 4,
    );
    await audio.fill();
    expect(audio.missing()).toEqual([]);
    expect(voice.spoken.length).toBe(6);
    expect(audio.progress()).toBeNull();

    await store.clear();
    voice.spoken = [];
    voice.fail = true;
    await audio.fill();
    expect(audio.error()).toBe('Slut på krediter.');
    // Två går i taget; ingen ny påbörjas efter felet.
    expect(voice.spoken.length).toBeLessThanOrEqual(2);
    expect(audio.missing().length).toBe(6);
  });
});
