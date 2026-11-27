import { Deck, McQuestion, Question, TfQuestion } from '../models/quiz.models';
import { plain } from './ai-explain';
import { tagLabel } from './tag-labels';
import { escapeHtml, mdBold } from './utils';

/**
 * Allt kring att bygga ut ett mazzo med nya frågor från Claude: vad som beställs, formatet
 * svaret ska ha och kontrollen av det som kommer tillbaka. Anropet ligger i AiService.
 */

/** Så många frågor som beställs åt gången. */
export const EXTEND_COUNT = 8;

export interface RawDeckQuestions {
  mc: {
    tag: string;
    kind: string;
    q: string;
    options: string[];
    answer: number;
    explain: string;
  }[];
  tf: { tag: string; q: string; answer: boolean; explain: string }[];
}

/** Taggarna i mazzot som nya frågor får höra till — para ihop-frågor byggs inte ut. */
export function quickTags(deck: Deck): string[] {
  return [...new Set(deck.pool.filter((q) => q.type !== 'match').map((q) => q.tag))];
}

/** Svarsformatet. Taggen är låst till dem som redan finns i mazzot. */
export function deckSchema(tags: readonly string[]) {
  const tag = { type: 'string', enum: tags } as const;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['mc', 'tf'],
    properties: {
      mc: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['tag', 'kind', 'q', 'options', 'answer', 'explain'],
          properties: {
            tag,
            kind: { type: 'string' },
            q: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            answer: { type: 'integer' },
            explain: { type: 'string' },
          },
        },
      },
      tf: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['tag', 'q', 'answer', 'explain'],
          properties: {
            tag,
            q: { type: 'string' },
            answer: { type: 'boolean' },
            explain: { type: 'string' },
          },
        },
      },
    },
  } as const;
}

export const DECK_SYSTEM = `Du skriver övningsfrågor till en app där svensktalande lär sig läsa italienska.

Appen har ett gym med små kortlekar, «mazzi». Varje mazzo övar en enda punkt — ett par småord, en ändelseregel från engelskan, en verbändelse, en grupp vanliga ord. Läsaren har gått igenom ett mazzo så många gånger att frågorna känns igen, men punkten sitter inte än. Du skriver nya frågor på samma punkt.

Du får mazzots frågor som de ser ut i dag. De visar både vad mazzot övar och hur en fråga är skriven. Håll dig till samma punkt, samma svårighet och samma stil — men på nya ord och nya exempel. En fråga som bara byter plats på alternativen i en gammal är ingen ny fråga.

# Flerval (mc)

- q: frågan på svenska, med det som frågas efter inom **dubbla asterisker**. Frågan får inte avslöja svaret.
- kind: rubriken över frågan — använd dem som redan står i mazzot.
- options: exakt fyra korta alternativ av samma sort. Felsvaren ska vara de förväxlingar en nybörjare faktiskt gör — fel person eller fel tempus, ett ord som liknar, en falsk vän — aldrig något uppenbart orimligt. Bara ett alternativ får vara rätt.
- answer: index (0–3) för det rätta. Lägg inte det rätta svaret på samma plats varje gång.
- explain: en rad som visar varför, i samma stil som mazzots egna.

# Sant eller falskt (tf)

- q: ett påstående på svenska om en form eller en regel, med formen inom **dubbla asterisker**. Blanda sanna och falska.
- answer: true eller false. explain: en rad som rättar eller bekräftar.

# Gemensamt

- tag: vilken av mazzots taggar frågan hör till. Använd bara dem som anges.
- Italienskan ska vara rätt. Skriv bara former och betydelser du är säker på, och håll ordförrådet till vanliga ord.
- Skriv hellre färre frågor än en som är tveksam.`;

export interface ExtendRequest {
  deck: Deck;
  pillarTitle: string;
  /** Läsarens träffsäkerhet per tagg, 0–1 — null där taggen inte har övats. */
  accuracy: Readonly<Record<string, number | null>>;
  count?: number;
}

/** En fråga som den visas för Claude: utan appens interna nycklar, med fetstil som **…**. */
function shown(q: Question): object | null {
  if (q.type === 'mc') {
    return {
      type: 'mc',
      tag: q.tag,
      kind: q.kind ?? 'Flerval',
      q: plain(q.q),
      options: q.options,
      answer: q.answer,
      explain: plain(q.explain),
    };
  }
  if (q.type === 'tf') {
    return { type: 'tf', tag: q.tag, q: plain(q.q), answer: q.answer, explain: plain(q.explain) };
  }
  return null;
}

export function deckPrompt(req: ExtendRequest): string {
  const { deck } = req;
  const count = req.count ?? EXTEND_COUNT;
  const tags = quickTags(deck).map((tag) => {
    const acc = req.accuracy[tag];
    const how = acc == null ? 'inte övad' : `${Math.round(acc * 100)} % rätt`;
    return `- ${tag} («${tagLabel(tag)}»): ${how}`;
  });
  return `Skriv ${count} nya frågor till mazzot ${deck.deckId} «${deck.title}»${deck.hint ? ` (${deck.hint})` : ''}, i pelaren ${req.pillarTitle}.

Taggarna och hur det går för läsaren på var och en. Lägg flest frågor där det går sämst:

${tags.join('\n')}

Mest flerval, och ett par sant eller falskt om mazzot har sådana.

Frågorna som finns i dag:

${JSON.stringify(deck.pool.map(shown).filter(Boolean))}`;
}

const same = (s: string) =>
  plain(s)
    .toLocaleLowerCase('it')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Gör ett svar till frågor som går att lägga i mazzot. En fråga som inte håller formen,
 * har en okänd tagg eller redan finns faller bort utan vidare.
 */
export function cleanDeckQuestions(raw: RawDeckQuestions, deck: Deck): Question[] {
  const tags = new Set(quickTags(deck));
  const seen = new Set(deck.pool.flatMap((q) => (q.type === 'match' ? [] : [same(q.q)])));
  const out: Question[] = [];
  const base = (tag: string, n: number) => ({
    tag,
    _k: `${deck.deckId}_ai_${n}`,
    statKey: `${deck.deckId}::${tag}`,
    ai: true,
  });
  // Nyckeln räknas vidare från mazzots storlek, så att den inte krockar med en äldre påbyggnad.
  let n = deck.pool.length;

  for (const r of raw.mc ?? []) {
    const q = (r.q ?? '').trim();
    const options = (r.options ?? []).map((o) => (o ?? '').trim());
    if (
      !tags.has(r.tag) ||
      !q ||
      seen.has(same(q)) ||
      options.length < 3 ||
      options.some((o) => !o) ||
      new Set(options).size !== options.length ||
      !Number.isInteger(r.answer) ||
      r.answer < 0 ||
      r.answer >= options.length
    ) {
      continue;
    }
    seen.add(same(q));
    const question: McQuestion = {
      type: 'mc',
      q: mdBold(escapeHtml(q)),
      options,
      answer: options[r.answer],
      explain: escapeHtml((r.explain ?? '').trim()),
      kind: (r.kind ?? '').trim() || 'Flerval',
      ...base(r.tag, n++),
    };
    out.push(question);
  }

  for (const r of raw.tf ?? []) {
    const q = (r.q ?? '').trim();
    if (!tags.has(r.tag) || !q || seen.has(same(q)) || typeof r.answer !== 'boolean') continue;
    seen.add(same(q));
    const question: TfQuestion = {
      type: 'tf',
      q: mdBold(escapeHtml(q)),
      answer: r.answer,
      explain: escapeHtml((r.explain ?? '').trim()),
      ...base(r.tag, n++),
    };
    out.push(question);
  }
  return out;
}
