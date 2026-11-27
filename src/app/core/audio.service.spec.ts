import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LettureData, UserText } from '../models/leggi.models';
import { AudioService } from './audio.service';
import { AudioStore } from './audio-store';
import { LeggiService } from './leggi.service';
import { VoiceError, VoiceService } from './voice.service';

const data: LettureData = {
  names: [],
  lexicon: {
    ciao: { p: 'D4', sv: 'hej' },
    "l'": { p: 'D1', sv: 'artikel' },
    amico: { p: 'D4', sv: 'vän' },
  },
  texts: [
    {
      id: 'uno',
      title: 'uno',
      sv: '',
      nota: '',
      level: 1,
      sentences: [
        { it: "Ciao, l'amico!", sv: '' },
        { it: 'Ciao.', sv: '' },
      ],
      question: { sv: '?', options: ['a', 'b'], answer: 0 },
    },
  ],
};

class FakeVoice {
  readonly ready = signal(true);
  readonly tag = signal('mia/m');
  spoken: string[] = [];
  fail = false;

  async speak(text: string): Promise<Uint8Array> {
    this.spoken.push(text);
    await Promise.resolve();
    if (this.fail) throw new VoiceError('Slut på tecken.');
    return new TextEncoder().encode(text);
  }
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

  it('vill ha ljud på varje mening och varje form — utom dem som inte går att säga', () => {
    expect(audio.wanted().sort()).toEqual(['Ciao.', "Ciao, l'amico!", 'amico', 'ciao'].sort());
    const own: UserText = {
      ...data.texts[0],
      id: 'ai-1',
      source: 'ai',
      createdAt: 1,
      sentences: [{ it: 'Buongiorno.', sv: '' }],
      lexicon: { buongiorno: { p: 'D4', sv: 'god dag' } },
    };
    TestBed.inject(LeggiService).addUserText(own);
    expect(audio.wanted()).toContain('Buongiorno.');
    expect(audio.wanted()).toContain('buongiorno');
  });

  it('läser in det som saknas, sparar det och läser aldrig in samma två gånger', async () => {
    expect(read(await audio.clip('  Ciao. '))).toBe('Ciao.');
    expect(read(await audio.clip('Ciao.'))).toBe('Ciao.');
    // Två som frågar samtidigt delar på en inläsning.
    await Promise.all([audio.clip('amico'), audio.clip('amico')]);
    expect(voice.spoken).toEqual(['Ciao.', 'amico']);
    expect(store.pending('mia/m')).toBe(2);
  });

  it('tar ett klipp ur biblioteket före en egen inläsning', async () => {
    await store.put('utvecklaren/m', [{ text: 'ciao', bytes: new Uint8Array([7]) }], true);
    expect(await audio.clip('ciao')).toEqual(new Uint8Array([7]));
    expect(voice.spoken).toEqual([]);
    // Finns både ett eget och ett hämtat går det egna före.
    await store.put('mia/m', [{ text: 'ciao', bytes: new Uint8Array([9]) }], false);
    expect(await audio.clip('ciao')).toEqual(new Uint8Array([9]));
  });

  it('ger inget utan egen röst när klippet saknas — men säger att det hämtade går att spela', async () => {
    voice.ready.set(false);
    expect(audio.can('ciao')).toBe(false);
    expect(await audio.clip('ciao')).toBeNull();
    await store.put('utvecklaren/m', [{ text: 'ciao', bytes: new Uint8Array([7]) }], true);
    expect(audio.can('ciao')).toBe(true);
    expect(audio.missing()).not.toContain('ciao');
  });

  it('läser in allt som saknas och stannar vid första felet', async () => {
    await audio.fill();
    expect(audio.missing()).toEqual([]);
    expect(voice.spoken.length).toBe(4);
    expect(audio.progress()).toBeNull();

    await store.clear();
    voice.spoken = [];
    voice.fail = true;
    await audio.fill();
    expect(audio.error()).toBe('Slut på tecken.');
    // Två går i taget; ingen ny påbörjas efter felet.
    expect(voice.spoken.length).toBeLessThanOrEqual(2);
    expect(audio.missing().length).toBe(4);
  });
});
