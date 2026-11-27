import { describe, expect, it } from 'vitest';
import {
  bookPrompt,
  COVER_ASPECT,
  coverPrompt,
  DEFAULT_TEMPLATE,
  imageFrom,
  imageRequest,
} from './cover';

const story = {
  title: 'La valigia blu',
  sv: 'Två blå resväskor.',
  cover: 'Två blå resväskor på en perrong.',
};
const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

describe('omslagets prompt', () => {
  it('sätter mallen först, sedan titeln och bokens bildprompt', () => {
    const prompt = coverPrompt('Mallen.', story);
    expect(prompt).toBe(
      'Mallen.\n\nTiteln: «La valigia blu»\n\nFramsidan: Två blå resväskor på en perrong.',
    );
  });

  it('tar läsarens egen bildprompt före bokens, och bokens rad när ingen prompt finns', () => {
    expect(bookPrompt(story, '  En egen.  ')).toBe('En egen.');
    expect(bookPrompt(story, '   ')).toBe('Två blå resväskor på en perrong.');
    expect(bookPrompt({ sv: 'Bara raden.' })).toBe('Bara raden.');
  });

  it('har en standardmall som ber om titeln och inget annat i bilden', () => {
    expect(DEFAULT_TEMPLATE).toMatch(/titel/i);
    expect(DEFAULT_TEMPLATE).toMatch(/utan någon annan text/);
  });

  it('ber om en bild i omslagets format', () => {
    expect(imageRequest('x')).toEqual({
      contents: [{ parts: [{ text: 'x' }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: COVER_ASPECT },
      },
    });
  });
});

describe('svaret från Gemini', () => {
  it('tar bilden ur svaret och hoppar över tankeskisser och text', () => {
    const image = imageFrom({
      candidates: [
        {
          content: {
            parts: [
              { text: 'Här är omslaget.' },
              { thought: true, inlineData: { mimeType: 'image/png', data: b64([9]) } },
              { inlineData: { mimeType: 'image/png', data: b64([1, 2, 3]) } },
            ],
          },
        },
      ],
    });
    expect(image.mime).toBe('image/png');
    expect([...image.bytes]).toEqual([1, 2, 3]);
  });

  it('läser också svaret med snake_case', () => {
    const image = imageFrom({
      candidates: [
        { content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64([7]) } }] } },
      ],
    });
    expect(image).toMatchObject({ mime: 'image/jpeg' });
  });

  it('förklarar varför det inte kom någon bild', () => {
    expect(() => imageFrom({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/SAFETY/);
    expect(() =>
      imageFrom({
        candidates: [
          { finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Jag kan inte.' }] } },
        ],
      }),
    ).toThrow(/ingen bild \(MAX_TOKENS\): Jag kan inte\./);
    expect(() => imageFrom({})).toThrow(/ingen bild/);
  });
});
