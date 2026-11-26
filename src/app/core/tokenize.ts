import { LexEntry, Token } from '../models/leggi.models';

const LEAD = /^[«"“(—–-]+/;
const TRAIL = /[.,!?;:»"”)…—–-]+$/;
/** Så många ord en fast enhet i ordlistan kan bestå av: «ce n'è». */
const MAX_UNIT = 3;

interface Word {
  pre: string;
  text: string;
  post: string;
  space: boolean;
}

/** Delar en mening i ord och skiljetecken. «l'amico» blir «l'» + «amico». */
function words(sentence: string): Word[] {
  const out: Word[] = [];
  for (const chunk of sentence.replace(/’/g, "'").split(/\s+/).filter(Boolean)) {
    const pre = chunk.match(LEAD)?.[0] ?? '';
    const rest = chunk.slice(pre.length);
    const post = rest.match(TRAIL)?.[0] ?? '';
    const core = rest.slice(0, rest.length - post.length);
    if (!core) {
      // Ett ensamt tankstreck — hänger på ordet före.
      if (out.length) out[out.length - 1].post += ' ' + chunk;
      continue;
    }
    const parts = core.split(/(?<=')/);
    parts.forEach((text, i) => {
      const last = i === parts.length - 1;
      out.push({ pre: i === 0 ? pre : '', text, post: last ? post : '', space: last });
    });
  }
  return out;
}

/** Sätter ihop ord till en nyckel eller yttext — utan mellanslag efter apostrof. */
function join(ws: Word[]): string {
  return ws.map((w, i) => w.text + (w.space && i < ws.length - 1 ? ' ' : '')).join('');
}

/**
 * Delar en mening i uppslagbara bitar. Längsta träffen i ordlistan vinner, så «ho mangiato»
 * blir en enhet och inte «ho» + ett okänt ord. Det som inte finns i ordlistan — egennamn —
 * blir en bit utan uppslag.
 */
export function tokenize(sentence: string, lexicon: Record<string, LexEntry>): Token[] {
  const ws = words(sentence);
  const tokens: Token[] = [];
  let i = 0;
  while (i < ws.length) {
    let taken = 1;
    let key: string | null = null;
    for (let n = Math.min(MAX_UNIT, ws.length - i); n >= 1; n--) {
      const unit = ws.slice(i, i + n);
      // Skiljetecken inne i enheten bryter den: «grande, è arrivato» är två saker.
      const unbroken = unit.every((w, j) => (j === n - 1 || !w.post) && (j === 0 || !w.pre));
      if (!unbroken) continue;
      const candidate = join(unit).toLocaleLowerCase('it');
      if (Object.hasOwn(lexicon, candidate)) {
        key = candidate;
        taken = n;
        break;
      }
    }
    const unit = ws.slice(i, i + taken);
    tokens.push({
      pre: unit[0].pre,
      text: join(unit),
      post: unit[taken - 1].post,
      space: unit[taken - 1].space,
      key,
      entry: key ? lexicon[key] : null,
    });
    i += taken;
  }
  return tokens;
}
