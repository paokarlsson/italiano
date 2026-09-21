/**
 * Regelmotorn bakom pelare 2.
 *
 * En primärregel byter engelsk ändelse mot italiensk. Sekundärreglerna är de
 * ortografiska skiften som banken lär ut vid sidan om — «-ct- → -tt-», «ph → f»,
 * stumt h som faller bort. Ett ord räknas som _rent_ när primärregeln ensam
 * träffar, _staplat_ när det krävs en eller två sekundärregler, och _undantag_
 * när ingen kombination når fram. De tre klasserna är PoC:ens svårighetsnivåer.
 */

/** Primärreglerna, i den ordning mazzin introducerar dem. */
export const PRIMARY = [
  { id: 'zione', deck: 'D2.1', from: /tion$/, to: 'zione', label: '-tion → -zione' },
  { id: 'sione', deck: 'D2.1', from: /sion$/, to: 'sione', label: '-sion → -sione' },
  { id: 'ta', deck: 'D2.2', from: /ty$/, to: 'tà', label: '-ty → -tà' },
  { id: 'ale', deck: 'D2.3', from: /al$/, to: 'ale', label: '-al → -ale' },
  { id: 'oso', deck: 'D2.4', from: /ous$/, to: 'oso', label: '-ous → -oso' },
  { id: 'bile', deck: 'D2.5', from: /ble$/, to: 'bile', label: '-ble → -bile' },
  { id: 'anza', deck: 'D2.6', from: /ance$/, to: 'anza', label: '-ance → -anza' },
  { id: 'enza', deck: 'D2.6', from: /ence$/, to: 'enza', label: '-ence → -enza' },
  { id: 'mento', deck: 'D2.7', from: /ment$/, to: 'mento', label: '-ment → -mento' },
  { id: 'ico', deck: 'D2.8', from: /ic$/, to: 'ico', label: '-ic → -ico' },
  { id: 'ista', deck: 'D2.9', from: /ist$/, to: 'ista', label: '-ist → -ista' },
  { id: 'ivo', deck: 'D2.13', from: /ive$/, to: 'ivo', label: '-ive → -ivo' },
  { id: 'ore', deck: 'D2.13', from: /or$/, to: 'ore', label: '-or → -ore' },
  { id: 'ura', deck: 'D2.13', from: /ure$/, to: 'ura', label: '-ure → -ura' },
  { id: 'izzare', deck: 'D2.13', from: /ize$/, to: 'izzare', label: '-ize → -izzare' },
  { id: 'ismo', deck: 'D2.13', from: /ism$/, to: 'ismo', label: '-ism → -ismo' },
  { id: 'logia', deck: 'D2.13', from: /logy$/, to: 'logia', label: '-logy → -logia' },
];

/** Sekundärreglerna — de ortografiska skiften som staplas ovanpå. */
export const SECONDARY = [
  { id: 'ct-tt', label: '-ct- → -tt-', apply: (s) => s.replace(/ct/g, 'tt') },
  { id: 'pt-tt', label: '-pt- → -tt-', apply: (s) => s.replace(/pt/g, 'tt') },
  { id: 'ph-f', label: 'ph → f', apply: (s) => s.replace(/ph/g, 'f') },
  { id: 'th-t', label: 'th → t', apply: (s) => s.replace(/th/g, 't') },
  { id: 'ch-c', label: 'ch → c', apply: (s) => s.replace(/ch/g, 'c') },
  { id: 'h-bort', label: 'stumt h faller bort', apply: (s) => s.replace(/^h/, '') },
  { id: 'y-i', label: 'y → i', apply: (s) => s.replace(/y/g, 'i') },
  { id: 'x-s', label: 'x → s', apply: (s) => s.replace(/x/g, 's') },
  { id: 'x-ss', label: 'x → ss', apply: (s) => s.replace(/x/g, 'ss') },
  { id: 'cz-z', label: 'c faller före z', apply: (s) => s.replace(/cz/g, 'z') },
  { id: 'ci-zi', label: 'ci → zi', apply: (s) => s.replace(/ci([oae])/g, 'zi$1') },
  { id: 'ti-zi', label: 'ti → zi', apply: (s) => s.replace(/ti([oae])/g, 'zi$1') },
];

/** Byter ändelse enligt en primärregel. Null när regeln inte gäller ordet. */
export function applyPrimary(en, rule) {
  return rule.from.test(en) ? en.replace(rule.from, rule.to) : null;
}

/**
 * Härleder den italienska formen och talar om hur den nåddes.
 * Provar primärregeln ensam först, sedan en sekundärregel, sedan två.
 */
export function derive(en, it, rule) {
  const base = applyPrimary(en.toLowerCase(), rule);
  if (base === null) return { klass: 'ej tillämplig', predicted: null, via: [] };

  const target = it.toLowerCase();
  if (base === target) return { klass: 'ren', predicted: base, via: [] };

  for (const a of SECONDARY) {
    if (a.apply(base) === target) return { klass: 'staplad', predicted: target, via: [a] };
  }
  for (const a of SECONDARY) {
    for (const b of SECONDARY) {
      if (a === b) continue;
      if (b.apply(a.apply(base)) === target) {
        return { klass: 'staplad', predicted: target, via: [a, b] };
      }
    }
  }
  return { klass: 'undantag', predicted: base, via: [] };
}

/** Adverbregeln är helt italiensk — inget engelskt ord behövs. */
export function adverb(adj) {
  if (/[lr]e$/.test(adj)) return adj.slice(0, -1) + 'mente';
  if (/o$/.test(adj)) return adj.slice(0, -1) + 'amente';
  return adj + 'mente';
}
