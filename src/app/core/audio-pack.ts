import { StoryData, UserText, Voice } from '../models/leggi.models';

/**
 * Paketformatet för det som delas ut: ljudklipp, texter och bokomslag i en enda fil, så att
 * en besökare hämtar några få filer i stället för tusen. Ett paket beskriver sig självt och
 * skrivs aldrig om — nytt innehåll blir ett nytt paket.
 *
 *   «ITPK» · huvudets längd (uint32, little endian) · huvudet som JSON · klippen i följd ·
 *   omslagen i följd
 *
 * Omslagen ligger sist, så att en äldre app som bara känner till klippen läser dem som förut
 * och lämnar resten. Egna böcker står i huvudet, under `books`, som en äldre app inte läser.
 */

const MAGIC = [0x49, 0x54, 0x50, 0x4b]; // «ITPK»
const PREAMBLE = MAGIC.length + 4;

/** Största paketet som laddas upp — Drive tar högst 5 MB i en enkel uppladdning. */
export const PACK_MAX_BYTES = 4 * 1024 * 1024;

export interface PackHeader {
  v: 1;
  /** Rösten och modellen klippen är inlästa med — se voiceTag(). */
  voice: string;
  /** Klippen i den ordning de ligger: texten som läses upp, och klippets längd i byte. */
  clips: [text: string, bytes: number][];
  /** Texter som följer med paketet. */
  texts: UserText[];
  /** Omslagen i den ordning de ligger efter klippen: bokens id, bildtyp och längd i byte. */
  covers?: [book: string, mime: string, bytes: number][];
  /** Egna böcker som följer med paketet, hela. */
  books?: StoryData[];
}

/** Ett bokomslag: bilden till en följetong, med boken som nyckel. */
export interface Cover {
  book: string;
  mime: string;
  bytes: Uint8Array;
}

export interface Clip {
  text: string;
  bytes: Uint8Array;
}

export interface Pack {
  voice: string;
  clips: Clip[];
  texts: UserText[];
  covers?: Cover[];
  books?: StoryData[];
}

/**
 * Röst och modell som en enda etikett, med vilken sorts röst det är först: «f:<röst>/<modell>».
 * Klipp med olika etikett är olika inläsningar.
 */
export function voiceTag(voice: Voice, voiceId: string, modelId: string): string {
  return `${voice}:${voiceId}/${modelId}`;
}

/** Vilken sorts röst en etikett är — null för en etikett som inte säger det. */
export function voiceOf(tag: string): Voice | null {
  const v = tag.split(':')[0];
  return v === 'f' || v === 'm' ? v : null;
}

/**
 * Texten som ett klipp läser upp, i den form det slås upp på. Samma italienska ska ge samma
 * klipp oavsett varifrån den kommer, så blanksteg och apostrofer jämnas ut.
 */
export function clipText(text: string): string {
  return text.normalize('NFC').replace(/’/g, "'").replace(/\s+/g, ' ').trim();
}

export function encodePack(pack: Pack): Uint8Array {
  const header: PackHeader = {
    v: 1,
    voice: pack.voice,
    clips: pack.clips.map((c) => [c.text, c.bytes.byteLength]),
    texts: pack.texts,
  };
  const covers = pack.covers ?? [];
  if (covers.length) header.covers = covers.map((c) => [c.book, c.mime, c.bytes.byteLength]);
  if (pack.books?.length) header.books = pack.books;
  const head = new TextEncoder().encode(JSON.stringify(header));
  const blobs = [...pack.clips, ...covers].map((x) => x.bytes);
  const body = blobs.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(PREAMBLE + head.byteLength + body);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC.length, head.byteLength, true);
  out.set(head, PREAMBLE);
  let at = PREAMBLE + head.byteLength;
  for (const bytes of blobs) {
    out.set(bytes, at);
    at += bytes.byteLength;
  }
  return out;
}

/** Läser ett paket. Kastar om filen inte är ett paket eller är avklippt. */
export function decodePack(file: Uint8Array): Pack {
  if (file.byteLength < PREAMBLE || MAGIC.some((b, i) => file[i] !== b)) {
    throw new Error('Filen är inget paket.');
  }
  const headLength = new DataView(file.buffer, file.byteOffset).getUint32(MAGIC.length, true);
  const headEnd = PREAMBLE + headLength;
  if (headEnd > file.byteLength) throw new Error('Paketet är avklippt.');

  let header: PackHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(file.subarray(PREAMBLE, headEnd))) as PackHeader;
  } catch {
    throw new Error('Paketets huvud går inte att läsa.');
  }
  if (header.v !== 1 || !Array.isArray(header.clips)) {
    throw new Error('Paketet har en version som appen inte känner till.');
  }

  const clips: Clip[] = [];
  let at = headEnd;
  for (const [text, bytes] of header.clips) {
    if (typeof text !== 'string' || !Number.isInteger(bytes) || bytes < 0) {
      throw new Error('Paketets huvud går inte att läsa.');
    }
    if (at + bytes > file.byteLength) throw new Error('Paketet är avklippt.');
    // En kopia, så att klippet inte håller hela paketet kvar i minnet.
    clips.push({ text, bytes: file.slice(at, at + bytes) });
    at += bytes;
  }
  const covers: Cover[] = [];
  for (const entry of Array.isArray(header.covers) ? header.covers : []) {
    const [book, mime, bytes] = entry;
    if (typeof book !== 'string' || typeof mime !== 'string' || !Number.isInteger(bytes)) {
      throw new Error('Paketets huvud går inte att läsa.');
    }
    if (bytes < 0 || at + bytes > file.byteLength) throw new Error('Paketet är avklippt.');
    covers.push({ book, mime, bytes: file.slice(at, at + bytes) });
    at += bytes;
  }
  const pack: Pack = { voice: String(header.voice ?? ''), clips, texts: header.texts ?? [] };
  if (covers.length) pack.covers = covers;
  if (Array.isArray(header.books) && header.books.length) pack.books = header.books;
  return pack;
}

/**
 * Delar upp omslagen i paket utan klipp, som vart och ett ryms i en uppladdning. Ett omslag
 * som ensamt är större än gränsen får ett eget paket.
 */
export function coverPacks(covers: readonly Cover[], maxBytes = PACK_MAX_BYTES): Pack[] {
  const packs: Pack[] = [];
  let current: Cover[] = [];
  let size = 0;
  for (const cover of covers) {
    const cost = cover.bytes.byteLength + cover.book.length + 64;
    if (current.length && size + cost > maxBytes) {
      packs.push({ voice: '', clips: [], texts: [], covers: current });
      current = [];
      size = 0;
    }
    current.push(cover);
    size += cost;
  }
  if (current.length) packs.push({ voice: '', clips: [], texts: [], covers: current });
  return packs;
}

/**
 * Delar upp böckerna i paket utan klipp, som vart och ett ryms i en uppladdning. En bok som
 * ensam är större än gränsen får ett eget paket.
 */
export function bookPacks(books: readonly StoryData[], maxBytes = PACK_MAX_BYTES): Pack[] {
  const packs: Pack[] = [];
  let current: StoryData[] = [];
  let size = 0;
  for (const book of books) {
    const cost = new TextEncoder().encode(JSON.stringify(book)).byteLength;
    if (current.length && size + cost > maxBytes) {
      packs.push({ voice: '', clips: [], texts: [], books: current });
      current = [];
      size = 0;
    }
    current.push(book);
    size += cost;
  }
  if (current.length) packs.push({ voice: '', clips: [], texts: [], books: current });
  return packs;
}

/**
 * Delar upp det som ska publiceras i paket som vart och ett ryms i en uppladdning.
 * Texterna följer med det första. Finns det varken klipp eller texter blir det inga paket.
 */
export function splitPacks(
  voice: string,
  clips: readonly Clip[],
  texts: readonly UserText[],
  maxBytes = PACK_MAX_BYTES,
): Pack[] {
  const packs: Pack[] = [];
  let current: Pack = { voice, clips: [], texts: [...texts] };
  let size = new TextEncoder().encode(JSON.stringify(texts)).byteLength;
  for (const clip of clips) {
    // Texten står också i huvudet — räkna den, med lite marginal för JSON runt om.
    const cost = clip.bytes.byteLength + clip.text.length * 3 + 16;
    if (size + cost > maxBytes && (current.clips.length || current.texts.length)) {
      packs.push(current);
      current = { voice, clips: [], texts: [] };
      size = 0;
    }
    current.clips.push(clip);
    size += cost;
  }
  if (current.clips.length || current.texts.length) packs.push(current);
  return packs;
}

/** Paketens filnamn i mappen: löpnummer, så att de läses in i den ordning de publicerades. */
export function packName(n: number): string {
  return `pack-${String(n).padStart(4, '0')}.itpk`;
}

/** Löpnumret ur ett filnamn, eller null om filen inte är ett paket. */
export function packNumber(name: string): number | null {
  const m = /^pack-(\d+)\.itpk$/.exec(name);
  return m ? Number(m[1]) : null;
}
