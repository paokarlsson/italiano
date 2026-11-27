import { UserText, Voice } from '../models/leggi.models';

/**
 * Paketformatet för det som delas ut: ljudklipp och texter i en enda fil, så att en besökare
 * hämtar några få filer i stället för tusen. Ett paket beskriver sig självt och skrivs aldrig
 * om — nytt innehåll blir ett nytt paket.
 *
 *   «ITPK» · huvudets längd (uint32, little endian) · huvudet som JSON · klippen i följd
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
}

export interface Clip {
  text: string;
  bytes: Uint8Array;
}

export interface Pack {
  voice: string;
  clips: Clip[];
  texts: UserText[];
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
  const head = new TextEncoder().encode(JSON.stringify(header));
  const audio = pack.clips.reduce((n, c) => n + c.bytes.byteLength, 0);
  const out = new Uint8Array(PREAMBLE + head.byteLength + audio);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC.length, head.byteLength, true);
  out.set(head, PREAMBLE);
  let at = PREAMBLE + head.byteLength;
  for (const clip of pack.clips) {
    out.set(clip.bytes, at);
    at += clip.bytes.byteLength;
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
  return { voice: String(header.voice ?? ''), clips, texts: header.texts ?? [] };
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
