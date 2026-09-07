/**
 * Läsbara namn på taggarna. I app-data.json är taggen en kort intern nyckel
 * («fwd», «sap-con», «pp-irr») — här står vad övningspunkten faktiskt heter för
 * den som övar. Statistiken och AI-exporten visar namnet i stället för nyckeln.
 *
 * Saknas en tagg visas nyckeln som den är, så nya frågor fungerar utan att den
 * här filen rörs — men en rad här gör dem läsbara.
 */
const TAG_LABELS: Readonly<Record<string, string>> = {
  // Il collante — limmet
  mean: 'ordbetydelse',
  match: 'para ihop',
  form: 'hitta rätt form',
  homo: 'e/è, ho/o — homofoner',
  non: 'placering av «non»',
  essere: 'essere i presens',
  avere: 'avere i presens',
  verb: 'vilket verb formen kommer från',
  def: 'bestämd artikel',
  indef: 'obestämd artikel',
  plural: 'artikel i plural',
  trafra: 'tra och fra',
  combine: 'preposition + artikel',
  phrase: 'frågefraser',
  ce: "c'è och ci sono",
  ci: 'partikeln ci',
  ne: 'partikeln ne',
  esistenza: "c'è, ci sono, ecco",
  particella: 'partiklar & samtalssignaler',

  // Le regole — suffixreglerna
  rule: 'själva suffixregeln',
  fwd: 'engelska → italienska',
  back: 'italienska → svenska',
  gen: 'suffixens genus & betoning',
  applica: 'tillämpa regeln på ett nytt ord',
  mente: '-ly → -mente',
  ivo: '-ive → -ivo',
  ore: '-or → -ore',
  ura: '-ure → -ura',
  izzare: '-ize → -izzare',
  ismo: '-ism → -ismo',
  logia: '-logy → -logia',
  ff: 'falska vänner',
  ff2: 'falska vänner',

  // Il motore — grammatiken
  kon: 'substantivens kön',
  exc: 'undantag i genus',
  pl: 'plural av substantiv',
  inv: 'oförändrad plural',
  sp: 'stavning i plural',
  agr: 'adjektivets kongruens',
  e: 'adjektiv på -e',
  term: 'kongruens som begrepp',
  voc: 'ordförråd',
  grp: 'verbgrupp -are/-ere/-ire',
  end: 'personändelser',
  who: 'läsa av person',
  sig: 'ändelsen signalerar person',
  are: '-are i presens',
  ere: '-ere i presens',
  ire: '-ire i presens',
  isc: '-isc-verb',
  irr: 'oregelbundna verb',
  read: 'läsa hela satser',
  build: 'bygga ihop fraser',
  'pp-reg': 'regelbundna particip',
  'pp-irr': 'oregelbundna particip',
  'pp-bygg': 'bilda passato prossimo',
  aux: 'hjälpverb: avere eller essere',
  accordo: 'participets kongruens',
  riflessivo: 'reflexiva verb i passato prossimo',
  rifl: 'reflexiva verb',
  'rifl-pass': 'reflexiva verb i dåtid',
  'imp-form': 'imperfetto: former',
  'imp-irr': 'imperfetto: oregelbundna',
  'imp-uso': 'imperfetto: användning',
  aspetto: 'imperfetto eller passato prossimo',
  fut: 'futurum',
  cond: 'konditionalis',
  ger: 'stare + gerundio',
  leggi: 'läsa av tempus',

  // Le parole — orden
  v: 'vanliga verb',
  p: 'personer & familj',
  b: 'kroppen',
  t: 'tid',
  l: 'plats & riktning',
  s: 'vardagssaker',
  f: 'mat & dryck',
  n: 'natur & väder',
  c: 'färger',
  a: 'motsatser',
  q: 'mängd & småord',
  'sap-con': 'sapere eller conoscere',
  'ess-stare': 'essere eller stare',
  buono: 'buono, bravo, bene',
  quant: 'molto, tanto, troppo, poco',
  piacere: 'piacere — att gilla baklänges',
  coppie: 'lätt förväxlade verbpar',
};

/** Taggens läsbara namn, eller nyckeln själv när ingen översättning finns. */
export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag;
}
