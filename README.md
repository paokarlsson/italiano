# Italiano · Companion

En Angular-app för att komma in i italienskan genom att läsa den.

Tanken bakom är att en liten kärna bär det mesta av löpande text: limmet (småorden),
reglerna (`-tion → -zione`), motorn (ändelserna) och de vanligaste orden. Appen har två
delar som bygger på samma fyra pelare:

- **Leggi** — vägen. Korta texter som nästan helt består av kärnan. Du läser, trycker på
  det du inte ser igenom och får ordet förklarat genom sin pelare. En fråga om innehållet
  avslutar texten. Det enda appen mäter är hur stor del du läste på egen hand.
- **Ripasso** — det som skaver. En kort repetition som appen själv plockar ihop ur det du
  slagit upp och det som går trögt i gymmet.
- **Palestra** — gymmet. 66 mazzi och drygt tusen frågor för den som vill nöta en enskild
  punkt. Motorn drar nya, blandade frågor varje runda och skjuter in en repetition på det
  du just missade. Ingenting här måste göras.
- **Fler texter** — valfritt. Med en egen API-nyckel från Anthropic skriver Claude nya
  texter på din nivå och gör vilken italiensk text som helst läsbar. Utan nyckel fungerar
  allt annat som vanligt.

Allt sparas lokalt. Gymmets statistik kan exporteras som en färdig prompt till valfri AI.

Appen började som en enfilad HTML-prototyp (`docs/original-prototype.html`) och är nu en
Angular 22-app med standalone-komponenter, signaler och zoneless change detection.

## Kom igång

Kräver Node ^22.22.3, ^24.15.0 eller >=26 — Angular 22:s golv, alltså en aktuell
patch av nuvarande LTS.

```bash
npm install
npm start          # dev-server på http://localhost:4200
npm run build      # produktionsbygge till dist/italiano
npm test           # enhetstester (vitest)
npm run format     # prettier över hela repot
```

Lockfilen är låst med npm 12 och installeras lika bra med npm 10 och 11. Ska du
_generera om_ den: npm 10.9.7 kraschar med `Cannot read properties of null
(reading 'edgesOut')` när den löser vitests peer-graf — använd npm 11 eller
senare (`npx npm@12 install`).

## CI

`.github/workflows/ci.yml` kör vid varje push och manuellt via _Run workflow_:
formatkontroll (`prettier --check`), enhetstester och produktionsbygge, på Node
22.22.3 och 24 — engines-golvet och nuvarande LTS. Bygget från Node 24 sparas som
artefakten `dist`. Pull requests byggs bara när de kommer från ett annat repo, så
samma commit inte körs två gånger.

## Så hänger det ihop

| Vy          | Route                  | Vad som händer                                                 |
| ----------- | ---------------------- | -------------------------------------------------------------- |
| Hem         | `/`                    | Nästa text att läsa, genvägar, och gymmet hopfällt per pelare  |
| Leggi       | `/leggi/:textId`       | En text, uppslag per ord, en fråga om innehållet               |
| Ripasso     | `/ripasso`             | Högst sex frågor, valda efter uppslag och svaga punkter        |
| Fler texter | `/testi`               | Nyckeln, ny text från Claude, egen inklistrad text             |
| Intro       | `/deck/:deckId`        | Exempelfråga ur mazzot och val av rundans längd (6/8/12)       |
| Runda       | `/deck/:deckId/quiz`   | Flerval, sant/falskt och para ihop, med direkt facit           |
| Resultat    | `/deck/:deckId/result` | Poäng, stjärnor och vägen vidare                               |
| Statistik   | `/stats`               | Träffsäkerhet per tagg, sorterad svagast först, plus AI-export |

Runda och resultat kräver en påbörjad runda — annars leder `activeRoundGuard`
tillbaka till introt. Okända id:n fångas av `deckExistsGuard` och `textExistsGuard`.

### Kod

```
src/app/
  core/          storage, data, stats, quiz (gymmets motor), leggi, tokenize, levels,
                 ripasso, ai + ai-text, hint, toast, ai-report, tag-labels, guards
  models/        typerna bakom app-data.json och letture.json
  pages/         home, leggi, ripasso, testi, intro, quiz (+ mc/tf/match), result, stats
  shared/        topbar
public/data/     app-data.json — gymmets frågor · letture.json — texterna och ordlistan
```

- **`LeggiService`** håller texterna, ordlistan och vad som hänt med varje ord. Ett
  uppslag är inget fel: ordet är «öppet» tills det står i en text och läses utan hjälp,
  eller sitter i en repetition. Nästa text är den första olästa; när allt är läst den med
  flest öppna ord.
- **`tokenize()`** delar en mening i uppslagbara bitar. Längsta träffen i ordlistan
  vinner, så «ho mangiato» och «c'è» förklaras som en enhet.
- **`buildRipasso()`** väljer repetitionens frågor. Ord repeteras som ord, regler på nya
  ord: ett uppslag i limmet eller orden blir en fråga på just det ordet — ur gymmet om det
  finns en, annars byggd ur meningen där det stod. Ett uppslag i reglerna eller motorn
  blir en fråga ur mazzot för samma mönster, helst på ett annat ord. Blir rundan kort
  fylls den på med gymmets svagaste taggar.
- **`levels.ts`** är stegen en text kan ligga på, 1–7. Första läsningen av en text flyttar
  nivån: 97 % eller mer på egen hand ger ett steg upp, under 85 % ett steg ned.
- **`AiService`** är kopplingen till Claude; `ai-text.ts` är allt runt omkring — prompten,
  svarsformatet och kontrollen av det som kommer tillbaka. Se _Fler texter_ nedan.
- **`QuizService`** är övningsmotorn: bygger rundans kö ur mazzots pool, räknar poäng
  och skjuter in högst två repetitioner per tagg och runda. En repetition är alltid en
  _ny_ fråga på samma punkt — aldrig samma fråga igen.
- **`StatsService`** för statistik per `statKey` (`<deckId>::<tag>`): försök, rätt, de
  senaste fem svaren och när taggen senast övades. Ett mazzo räknas som klarat vid
  minst 60 % rätt.
- **`tagLabel()`** översätter den interna taggnyckeln till det övningspunkten heter —
  `sap-con` blir «sapere eller conoscere». Statistikvyn och AI-exporten visar namnet,
  aldrig nyckeln.
- **`StorageService`** väljer lagring i tur och ordning: `window.storage` om appen körs
  i en värd som erbjuder det, annars `localStorage`, annars minnet. Statistikvyn
  berättar vilken som används när det inte är den beständiga.

### Innehållet

`public/data/app-data.json` är en lista av pelare → mazzi → frågor. Tre frågetyper:

```jsonc
{ "type": "mc",    "q": "Vad betyder <b>ma</b>?", "options": ["och", "men"], "answer": "men", "explain": "«ma» = men." }
{ "type": "tf",    "q": "«non» placeras <b>efter</b> verbet.", "answer": false, "explain": "…" }
{ "type": "match", "instr": "Para ihop italienska med svenska.", "pairs": [["sì", "ja"], ["no", "nej"]] }
```

Varje fråga har dessutom `tag`, `_k` (unik i mazzot) och `statKey`. Lägger du till
frågor räcker det att fylla på JSON-filen — inget i koden behöver ändras. En helt ny
`tag` visas som den är i statistiken tills den får en rad i `core/tag-labels.ts`.

Varje mazzo har också ett `hint` — minnesregeln, `"-tion → -zione"` — som står under
titeln på startsidans bricka. Är det tomt visas antalet frågor i stället.

### Texterna

`public/data/letture.json` har tre delar: `texts`, `lexicon` och `names`.

```jsonc
// texts — meningar med översättning, en rad om vad som är nytt och en fråga om innehållet
{ "id": "al-bar", "title": "Al bar", "sv": "På kaféet", "nota": "Ändelsen visar vem …",
  "sentences": [{ "it": "Marco è al bar con un amico.", "sv": "Marco är på kaféet med en vän." }],
  "question": { "sv": "Vad pratar de om?", "options": ["Musik", "Kaffe", "Arbete"], "answer": 0 } }

// lexicon — nyckeln är formen i gemener; p är pelaren, deck mazzot där punkten går att nöta
"parlano":     { "p": "D3", "sv": "de pratar", "note": "parl·ano — -ano = de (parlare)", "deck": "D3.7" }
"ho mangiato": { "p": "D3", "sv": "jag åt", "note": "avere + mangi·ato (mangiare)", "deck": "D3.11" }
```

En ny text behöver bara en post i `texts` och ordlisteposter för de former som saknas.
`letture.spec.ts` läser filen och fäller bygget om ett ord saknar uppslag, om en post
aldrig används eller om `deck` pekar på ett mazzo som inte finns. Egennamn står i `names`.

### Fler texter

Appen har ingen server. Nyckeln läggs in på `/testi`, sparas i webbläsarens lagring och
används bara i anrop direkt till Anthropic (`@anthropic-ai/sdk`, som laddas först när det
behövs). Lägg inte in en nyckel på en dator du delar med andra.

- **Ny text.** Claude får pelarna, nivåstegen, listan över mazzi och en inbyggd text som
  mall, och ombeds skriva på läsarens nivå med de senast uppslagna orden invävda.
- **Egen text.** En inklistrad italiensk text (högst 2 000 tecken) delas i meningar,
  översätts och får en ordlista. Italienskan ska komma tillbaka ordagrant; gör den inte det
  säger appen till.
- **Kontrollen.** Svaret är låst till ett JSON-schema. Därefter gör `assembleText()` samma
  sak som `letture.spec.ts` gör för de inbyggda texterna: varje ord ska ha ett uppslag
  eller vara ett egennamn. Saknas något begärs en komplettering, en gång. Det som ändå
  saknas blir ord utan uppslag, och antalet visas.
- **Modell.** Opus 5.5 är förvald; Sonnet 5.5 och Haiku 5.5 går att välja. För Opus och
  Sonnet är Anthropics reservmodell på serversidan påslagen (`fallbacks: "default"`), så
  en avböjd begäran prövas på en annan modell i stället för att bara stanna.
- **Kostnad.** Efter varje text visas en ungefärlig kostnad, räknad på listpriserna i
  `AI_MODELS`. Ändras priserna behöver tabellen uppdateras för hand.

Egna texter sparas lokalt och ligger kvar vid «Nollställ allt» — de är innehåll, inte
framsteg.
