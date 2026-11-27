import { StoryData } from '../models/leggi.models';

/**
 * Omslagen till böckerna — följetongerna som följer med appen. Ett omslag ritas av Gemini
 * («Nano Banana») efter en prompt i två delar: mallen, som är densamma för alla böcker och
 * ger dem samma stil, och bokens egen bildprompt, som säger vad som står på just dess
 * framsida. Rena funktioner; anropet ligger i GeminiService.
 */

/** Bildmodellerna att välja bland, nyast först. Id:t är det som står i anropets adress. */
export const IMAGE_MODELS: readonly { id: string; name: string; note: string }[] = [
  { id: 'gemini-nano-banana-2.1', name: 'Nano Banana 2.1', note: 'den nyaste' },
  { id: 'gemini-3.1-flash-lite-image', name: 'Nano Banana 2 Lite', note: 'snabbast och billigast' },
  { id: 'gemini-3-pro-image', name: 'Nano Banana Pro', note: 'dyrast, skarpast text' },
  { id: 'gemini-3.1-flash-image', name: 'Nano Banana 2', note: 'stabil' },
  { id: 'gemini-2.5-flash-image', name: 'Nano Banana', note: 'den första' },
];

export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0].id;

/** Omslagets format: stående, som en bok. */
export const COVER_ASPECT = '3:4';

/**
 * Mallen som läggs före varje boks bildprompt. Den bestämmer stilen, så att böckerna ser ut
 * att höra ihop; bokens egen prompt bestämmer motivet.
 */
export const DEFAULT_TEMPLATE = `Framsidan till en tunn, lättläst bok för vuxna som lär sig italienska — en serie där alla böcker ser ut att höra ihop.

Stil: platt, varm illustration i gouache med synlig papperstextur, som en klassisk italiensk resaffisch. Begränsad palett: krämvit, flaskgrönt, varmt ockra, terrakotta och en klar accentfärg från motivet. Mjukt sidoljus, enkla former, inga fotorealistiska detaljer.

Komposition: stående format. Motivet i nedre två tredjedelarna. Lugn yta överst med bokens titel i en elegant serif med versaler och gemener — exakt som den står nedan, på italienska, utan stavfel och utan någon annan text i bilden. Inga logotyper, ingen ram, ingen streckkod.`;

/** Bokens del av prompten: den egna bildprompten om läsaren har skrivit en, annars bokens. */
export function bookPrompt(story: Pick<StoryData, 'cover' | 'sv'>, own?: string): string {
  return (own ?? '').trim() || story.cover?.trim() || story.sv;
}

/** Hela prompten: mallen, titeln och vad framsidan ska visa. */
export function coverPrompt(
  template: string,
  story: Pick<StoryData, 'title' | 'cover' | 'sv'>,
  own?: string,
): string {
  return [template.trim(), `Titeln: «${story.title}»`, `Framsidan: ${bookPrompt(story, own)}`]
    .filter(Boolean)
    .join('\n\n');
}

/** Anropet till Gemini för en bild: bara text in, en bild ut i omslagets format. */
export function imageRequest(prompt: string): unknown {
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: COVER_ASPECT },
    },
  };
}

interface Part {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

interface ImageResponse {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Bilden ur Geminis svar — den sista bilddelen som inte är en tankeskiss. Kastar med en
 * förklaring om svaret inte har någon bild.
 */
export function imageFrom(response: unknown): { mime: string; bytes: Uint8Array } {
  const res = response as ImageResponse;
  if (res.promptFeedback?.blockReason) {
    throw new Error(`Gemini avböjde prompten (${res.promptFeedback.blockReason}).`);
  }
  const candidate = res.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const images = parts
    .filter((p) => !p.thought)
    .map((p) => {
      const data = p.inlineData?.data ?? p.inline_data?.data;
      const mime = p.inlineData?.mimeType ?? p.inline_data?.mime_type ?? 'image/png';
      return data ? { mime, data } : null;
    })
    .filter((x): x is { mime: string; data: string } => !!x && x.mime.startsWith('image/'));
  const image = images.at(-1);
  if (!image) {
    const said = parts
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text!.trim())
      .join(' ');
    const why = candidate?.finishReason && candidate.finishReason !== 'STOP';
    throw new Error(
      `Gemini skickade ingen bild${why ? ` (${candidate!.finishReason})` : ''}${said ? `: ${said.slice(0, 200)}` : '.'}`,
    );
  }
  return { mime: image.mime, bytes: fromBase64(image.data) };
}

function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
