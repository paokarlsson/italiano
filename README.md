# Italiano · Companion

En Angular-app för att öva italienska: fyra pelare, 66 mazzi och drygt tusen frågor.
Motorn drar nya, blandade frågor varje runda och skjuter automatiskt in en repetition
på det du just missade. Framsteg och träffsäkerhet sparas lokalt och kan exporteras
som en färdig prompt till valfri AI.

Appen är en port av den ursprungliga enfilade HTML-prototypen
(`italianocompanion.html`) till en Angular 22-app med standalone-komponenter,
signaler och zoneless change detection. Formspråk, texter och övningslogik är desamma.

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

`.github/workflows/ci.yml` kör vid varje push och manuellt via *Run workflow*:
formatkontroll (`prettier --check`), enhetstester och produktionsbygge, på Node
22.22.3 och 24 — engines-golvet och nuvarande LTS. Bygget från Node 24 sparas som
artefakten `dist`. Pull requests byggs bara när de kommer från ett annat repo, så
samma commit inte körs två gånger.

## Så hänger det ihop

| Vy        | Route                  | Vad som händer                                                 |
| --------- | ---------------------- | -------------------------------------------------------------- |
| Hem       | `/`                    | Alla pelare och mazzi, framstegsmätare, tips och nollställning |
| Intro     | `/deck/:deckId`        | Exempelfråga ur mazzot och val av rundans längd (6/8/12)       |
| Runda     | `/deck/:deckId/quiz`   | Flerval, sant/falskt och para ihop, med direkt facit           |
| Resultat  | `/deck/:deckId/result` | Poäng, stjärnor och vägen vidare                               |
| Statistik | `/stats`               | Träffsäkerhet per tagg, sorterad svagast först, plus AI-export |

Runda och resultat kräver en påbörjad runda — annars leder `activeRoundGuard`
tillbaka till introt. Okända mazzo-id:n fångas av `deckExistsGuard`.

### Kod

```
src/app/
  core/          storage, data, stats, quiz (motorn), hint, toast, ai-report, tag-labels, guards
  models/        typerna bakom app-data.json
  pages/         home, intro, quiz (+ mc/tf/match), result, stats
  shared/        topbar
public/data/     app-data.json — allt innehåll
```

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
