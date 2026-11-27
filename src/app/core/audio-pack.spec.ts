import { describe, expect, it } from 'vitest';
import { StoryData, UserText } from '../models/leggi.models';
import {
  bookPacks,
  clipText,
  coverPacks,
  decodePack,
  encodePack,
  packName,
  packNumber,
  splitPacks,
  voiceOf,
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
      voice: voiceTag('f', 'v1', 'm1'),
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

  it('märker röstens etikett med vilken sorts röst det är', () => {
    expect(voiceTag('m', 'daniele', 'flash')).toBe('m:daniele/flash');
    expect(voiceOf('m:daniele/flash')).toBe('m');
    expect(voiceOf('f:samanta/flash')).toBe('f');
    expect(voiceOf('daniele/flash')).toBeNull();
  });

  it('numrerar paketen så att de sorteras i den ordning de publicerades', () => {
    expect(packName(7)).toBe('pack-0007.itpk');
    expect(packNumber('pack-0007.itpk')).toBe(7);
    expect(packNumber('pack-12345.itpk')).toBe(12345);
    expect(packNumber('anteckningar.txt')).toBeNull();
  });

  it('packar omslag efter klippen och läser tillbaka dem', () => {
    const pack = {
      voice: 'f:x/m',
      clips: [{ text: 'ciao', bytes: new Uint8Array([1, 2]) }],
      texts: [],
      covers: [{ book: 'valigia-blu', mime: 'image/png', bytes: new Uint8Array([7, 8, 9]) }],
    };
    const back = decodePack(encodePack(pack));
    expect(back.clips).toEqual(pack.clips);
    expect(back.covers).toEqual(pack.covers);
  });

  it('läser ett paket utan omslag som förut', () => {
    const back = decodePack(encodePack({ voice: 'f:x/m', clips: [], texts: [] }));
    expect(back.covers).toBeUndefined();
  });

  it('säger ifrån när ett omslag är avklippt', () => {
    const file = encodePack({
      voice: '',
      clips: [],
      texts: [],
      covers: [{ book: 'b', mime: 'image/png', bytes: new Uint8Array(10) }],
    });
    expect(() => decodePack(file.subarray(0, file.byteLength - 1))).toThrow(/avklippt/);
  });

  it('delar omslagen i paket som ryms i en uppladdning', () => {
    const cover = (book: string, n: number) => ({
      book,
      mime: 'image/png',
      bytes: new Uint8Array(n),
    });
    const packs = coverPacks([cover('a', 600), cover('b', 600), cover('c', 100)], 1000);
    expect(packs.map((p) => p.covers?.map((c) => c.book))).toEqual([['a'], ['b', 'c']]);
    expect(packs.every((p) => p.voice === '' && !p.clips.length)).toBe(true);
    expect(coverPacks([])).toEqual([]);
  });

  it('packar egna böcker i huvudet och läser tillbaka dem', () => {
    const book = { id: 'bok-1', title: 'Libro', chapters: [] } as unknown as StoryData;
    const pack = decodePack(encodePack({ voice: '', clips: [], texts: [], books: [book] }));
    expect(pack.books).toEqual([book]);
    expect(decodePack(encodePack({ voice: '', clips: [], texts: [] })).books).toBeUndefined();
  });

  it('delar böckerna i paket som ryms i en uppladdning', () => {
    const book = (id: string, n: number) =>
      ({ id, title: 'x'.repeat(n), chapters: [] }) as unknown as StoryData;
    const packs = bookPacks([book('a', 600), book('b', 600), book('c', 100)], 1000);
    expect(packs.map((p) => p.books?.map((b) => b.id))).toEqual([['a'], ['b', 'c']]);
    expect(packs.every((p) => p.voice === '' && !p.clips.length && !p.texts.length)).toBe(true);
    expect(bookPacks([])).toEqual([]);
  });
});
