import { describe, expect, it } from 'vitest';
import { UserText } from '../models/leggi.models';
import {
  clipText,
  decodePack,
  encodePack,
  packName,
  packNumber,
  splitPacks,
  voiceTag,
} from './audio-pack';

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (id: string): UserText => ({
  id,
  title: id,
  sv: '',
  nota: '',
  level: 2,
  sentences: [{ it: 'Ciao.', sv: 'Hej.' }],
  question: { sv: '?', options: ['a', 'b'], answer: 0 },
  source: 'ai',
  createdAt: 1,
  lexicon: { ciao: { p: 'D4', sv: 'hej' } },
});

describe('paketformatet', () => {
  it('packar klipp och texter i en fil och läser tillbaka dem oförändrade', () => {
    const pack = {
      voice: voiceTag('v1', 'm1'),
      clips: [
        { text: 'È già qui.', bytes: bytes(1, 2, 3) },
        { text: 'parlano', bytes: bytes() },
        { text: 'città', bytes: bytes(255, 0, 7, 9) },
      ],
      texts: [text('ai-1')],
    };
    const file = encodePack(pack);
    expect(String.fromCharCode(...file.subarray(0, 4))).toBe('ITPK');
    expect(decodePack(file)).toEqual(pack);
  });

  it('läser ett paket som är en vy in i en större buffert', () => {
    const file = encodePack({ voice: 'v', clips: [{ text: 'a', bytes: bytes(5, 6) }], texts: [] });
    const padded = new Uint8Array(file.byteLength + 8);
    padded.set(file, 8);
    expect(decodePack(padded.subarray(8)).clips[0].bytes).toEqual(bytes(5, 6));
  });

  it('säger ifrån när filen inte är ett paket eller är avklippt', () => {
    const file = encodePack({
      voice: 'v',
      clips: [{ text: 'a', bytes: bytes(1, 2, 3) }],
      texts: [],
    });
    expect(() => decodePack(bytes(1, 2, 3))).toThrow('inget paket');
    expect(() => decodePack(new TextEncoder().encode('<html>inte här</html>'))).toThrow();
    expect(() => decodePack(file.subarray(0, file.byteLength - 1))).toThrow('avklippt');
    expect(() => decodePack(file.subarray(0, 10))).toThrow('avklippt');
  });

  it('jämnar ut texten ett klipp slås upp på', () => {
    expect(clipText('  l’amico \n è  qui ')).toBe("l'amico è qui");
    // Samma bokstav skriven på två sätt ska ge samma klipp.
    expect(clipText('città')).toBe(clipText('città'));
  });

  it('delar upp det som ska publiceras så att varje paket ryms i en uppladdning', () => {
    const clip = (t: string) => ({ text: t, bytes: new Uint8Array(400) });
    const packs = splitPacks('v', [clip('a'), clip('b'), clip('c')], [text('ai-1')], 1000);
    // Texterna följer med det första paketet; klippen fylls på tills taket är nått.
    expect(packs.map((p) => [p.clips.map((c) => c.text).join(''), p.texts.length])).toEqual([
      ['a', 1],
      ['bc', 0],
    ]);
    for (const pack of packs) expect(encodePack(pack).byteLength).toBeLessThanOrEqual(1000);
    expect(splitPacks('v', [clip('a')], [], 1000).length).toBe(1);
    expect(splitPacks('v', [], [text('ai-1')])).toMatchObject([{ clips: [], texts: [{}] }]);
    expect(splitPacks('v', [], [])).toEqual([]);
  });

  it('numrerar paketen så att de sorteras i den ordning de publicerades', () => {
    expect(packName(7)).toBe('pack-0007.itpk');
    expect(packNumber('pack-0007.itpk')).toBe(7);
    expect(packNumber('pack-12345.itpk')).toBe(12345);
    expect(packNumber('anteckningar.txt')).toBeNull();
  });
});
