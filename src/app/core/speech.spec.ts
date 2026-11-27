import { describe, expect, it } from 'vitest';
import letture from '../../../public/data/letture.json';
import { LettureData } from '../models/leggi.models';
import { parts, quoteCount, speakersFit, textParts } from './speech';

describe('vem som säger vad', () => {
  it('låter berättaren läsa det utanför replikerna och den som talar läsa repliken', () => {
    expect(
      parts(
        { it: 'Un uomo risponde: «È qui, ma oggi è in ritardo.»', sv: '', speakers: ['m'] },
        'f',
      ),
    ).toEqual([
      { text: 'Un uomo risponde:', voice: 'f' },
      { text: 'È qui, ma oggi è in ritardo.', voice: 'm' },
    ]);
    // Skiljetecknen mellan repliken och resten följer inte med.
    expect(parts({ it: '«È normale», dice l’uomo.', sv: '', speakers: ['m'] }, 'f')).toEqual([
      { text: 'È normale', voice: 'm' },
      { text: "dice l'uomo.", voice: 'f' },
    ]);
  });

  it('läser två repliker i samma mening med var sin röst', () => {
    expect(
      parts({ it: '«Avete il pesce oggi?» «Sì, ne abbiamo molto.»', sv: '', speakers: ['f', 'm'] }),
    ).toEqual([
      { text: 'Avete il pesce oggi?', voice: 'f' },
      { text: 'Sì, ne abbiamo molto.', voice: 'm' },
    ]);
  });

  it('låter berättaren läsa en replik som saknar röst, och en mening utan repliker', () => {
    expect(parts({ it: '«Ciao!» «Ciao!»', sv: '', speakers: ['m'] }, 'f')).toEqual([
      { text: 'Ciao!', voice: 'm' },
      { text: 'Ciao!', voice: 'f' },
    ]);
    expect(parts({ it: 'Da bambino abitavo qui.', sv: '' }, 'm')).toEqual([
      { text: 'Da bambino abitavo qui.', voice: 'm' },
    ]);
  });

  it('säger när rösterna inte går jämnt upp med replikerna', () => {
    expect(quoteCount('«A» b «C»')).toBe(2);
    expect(speakersFit({ it: '«A» b «C»', sv: '', speakers: ['f', 'm'] })).toBe(true);
    expect(speakersFit({ it: '«A» b «C»', sv: '', speakers: ['f'] })).toBe(false);
    expect(speakersFit({ it: 'Ingen replik.', sv: '' })).toBe(true);
    expect(speakersFit({ it: '«A»', sv: '', speakers: ['x' as 'f'] })).toBe(false);
  });

  it('har en röst för varje replik i de inbyggda texterna, och båda rösterna hörs', () => {
    const data = letture as LettureData;
    for (const text of data.texts) {
      expect(['f', 'm'], text.id).toContain(text.narrator);
      for (const s of text.sentences) {
        expect(s.speakers?.length ?? 0, `${text.id}: ${s.it}`).toBe(quoteCount(s.it));
        expect(speakersFit(s), `${text.id}: ${s.it}`).toBe(true);
      }
    }
    const voices = new Set(
      data.texts.flatMap((t) =>
        textParts(t)
          .flat()
          .map((p) => p.voice),
      ),
    );
    expect([...voices].sort()).toEqual(['f', 'm']);
  });
});
