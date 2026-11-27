# Italiano · Companion

En Angular-app för att komma in i italienskan genom att läsa den.

Tanken bakom är att en liten kärna bär det mesta av löpande text: limmet (småorden),
reglerna (`-tion → -zione`), motorn (ändelserna) och de vanligaste orden. Appen har två
delar som bygger på samma fyra pelare:

- **Leggi** — vägen. Korta texter som nästan helt består av kärnan. Du läser, trycker på
  det du inte ser igenom och får ordet förklarat genom sin pelare. En fråga om innehållet
  avslutar texten. Det enda appen mäter är hur stor del du läste på egen hand.
- **Alba & Luca** — följetongen. En kärlekshistoria i Genua i 14 kapitel, ett per låt på
  albumet _Alba & Luca_ (Lontano), där grammatiken följer handlingen: dåtid när personerna
  börjar minnas, framtid när de vågar tänka framåt. Efter varje kapitel kommer låtens
  refräng med svenska under. Följetongen följer med appen, utan ljud. Med en Claude-nyckel
  skrivs varje sida om efter hur det gick på den förra — samma scen och repliker, men
  språket på din nivå och med dina öppna ord invävda. Med en ElevenLabs-nyckel läses den
  upp. Planen, kanon och låttexterna ligger i `docs/alba-luca/` och
  `public/data/storie/alba-luca/`.
- **La valigia blu**, **Il cane di nessuno** och **Ciao, bella!** — tre korta berättelser
  på de två första nivåerna. I den första kommer Sofia till Bologna och tar fel blå
  resväska; i den andra får bagaren Nina på Sicilien en smutsig hund som kund, som ingen
  vill kännas vid; i den tredje försöker Marco — guldkedja, uppknäppt skjorta,
  solglasögon mitt i natten — ragga på en svensk ingenjör i en bar i Rimini, med varenda
  kliché han kan, tills mamma ringer. Sju sidor var, som läses varvat med grundkursen —
  varje sida efter grundkursens texter på samma nivå — så att den som börjar har något att
  följa redan från början. De läses alltid som de står och skrivs inte om.
- **Ripasso** — det som skaver. En kort repetition som appen själv plockar ihop ur det du
  slagit upp och det som går trögt i gymmet.
- **Palestra** — gymmet. 66 mazzi och drygt tusen frågor för den som vill nöta en enskild
  punkt. Motorn drar nya, blandade frågor varje runda och skjuter in en repetition på det
  du just missade. Ingenting här måste göras.
- **Fler texter** — valfritt. Med en egen API-nyckel från Anthropic skriver Claude nya
  texter på din nivå, som delar i en berättelse och täta på det du slår upp mest, och gör
  vilken italiensk text som helst läsbar. Varje sådan text kommer med egna frågor till
  repetitionen. Utan nyckel fungerar allt annat som vanligt.
- **Egna böcker** — samma nyckel. Under _Fler texter_ beskriver du boken du vill läsa,
  med egna ord, och väljer nivå (1–7) och antal sidor. Claude planerar först boken —
  titel, personer, kapitel och en scen per sida — och skriver sedan sidorna en i taget på
  den nivån, med samma kontroll som de inbyggda böckerna: meningslängd, tempus och ett
  uppslag för varje ord. En sida som inte håller skrivs en gång till. Boken sparas sida
  för sida och läses som de andra följetongerna; en påbörjad egen bok visas på
  startsidan bredvid den du står i. Stannar den på vägen skrivs resten med _Skriv klart_.
  En ny bok kan vara en uppföljare till en tidigare — en egen, en hämtad eller en av
  böckerna i appen: Claude får personerna, scenerna och sista sidan ur den och fortsätter
  där den slutade. Bakgrunden sparas med uppföljaren, så att den håller även om den
  tidigare boken tas bort.
  Finns en Gemini-nyckel ritas omslaget när boken är klar. En bok som är skriven klart
  publiceras i biblioteket när du väljer det, med en knapp per bok under _Dina böcker_ —
  en i taget, med sitt omslag, och aldrig med resten under Ljud. En besökare får den bland
  sina böcker, märkt «ur biblioteket».
- **Ljud och bibliotek** — valfritt. Varje mening och varje ord kan ha ett inläst klipp,
  med en kvinnlig och en manlig röst efter vem som talar. Den som har en egen
  ElevenLabs-nyckel läser in det som saknas; den som publicerar lägger
  klippen, sina lästa texter och sina egna böcker i en publik mapp på Google Drive, och en besökares app
  hämtar alltihop av sig själv, utan att någon loggar in.

- **Omslag** — valfritt. Med en egen nyckel till Googles Gemini API ritar «Nano Banana» en
  framsida till varje bok. Prompten är en mall som är densamma för alla böcker, följd av
  bokens titel och bokens egen bildprompt. Omslagen publiceras i biblioteket som ljudet.

Det som kräver en nyckel eller en inloggning syns bara när den finns. Utan Claude-nyckel
finns ingen länk till Fler texter, utan ElevenLabs-nyckel eller Google-inloggning ingen
länk till Ljud. Inställningar syns alltid — det är där nycklarna läggs in.

- **Påfyllning** — med nyckeln inlagd ligger det alltid två olästa texter färdiga, och ett
  mazzo som är genomgånget utan att sitta får nya frågor. Ingenting behöver beställas.
- **Perché?** — valfritt, samma nyckel. En knapp i uppslaget och under facit i gymmet och
  repetitionen: Claude förklarar varför formen ser ut som den gör, eller varför svaret var
  fel, när appens egen rad inte räcker.

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

| Vy          | Route                  | Vad som händer                                                  |
| ----------- | ---------------------- | --------------------------------------------------------------- |
| Hem         | `/`                    | Nästa text, berättelsen, mazzot att satsa på, gymmet per pelare |
| Leggi       | `/leggi/:textId`       | En text, uppslag per ord, en fråga om innehållet                |
| Canzone     | `/canzone/:songId`     | Låten efter ett kapitel i följetongen: refrängen it/sv          |
| Ripasso     | `/ripasso`             | Högst sex frågor, valda efter uppslag och svaga punkter         |
| Fler texter | `/testi`               | Ny text eller nästa del, egen text, dina texter                 |
| Ljud        | `/suono`               | Hämta biblioteket, läs in med egen röst, publicera              |
| Inställn.   | `/installningar`       | Nycklar, modell, röster, påfyllning och vad allt har kostat     |
| Intro       | `/deck/:deckId`        | Exempelfråga ur mazzot och val av rundans längd (6/8/12)        |
| Runda       | `/deck/:deckId/quiz`   | Flerval, sant/falskt och para ihop, med direkt facit            |
| Resultat    | `/deck/:deckId/result` | Poäng, stjärnor och vägen vidare                                |
| Statistik   | `/stats`               | Träffsäkerhet per tagg, sorterad svagast först, plus AI-export  |

Runda och resultat kräver en påbörjad runda — annars leder `activeRoundGuard`
tillbaka till introt. Okända id:n fångas av `deckExistsGuard` och `textExistsGuard`.

### Kod

```
src/app/
  core/          storage, data, stats, quiz (gymmets motor), leggi, tokenize, levels,
                 profile, recommend, ripasso, ai + ai-text + ai-explain + ai-deck, supply,
                 cover + gemini + cover-store,
                 audio + audio-store + audio-pack, speech, voice, drive, library,
                 cloud.config,
                 hint, toast, ai-report, tag-labels, guards
  models/        typerna bakom app-data.json och letture.json
  pages/         home, leggi, ripasso, testi, suono, settings, intro, quiz (+ mc/tf/match),
                 result, stats
  shared/        topbar, perche
public/data/     app-data.json — gymmets frågor · letture.json — texterna och ordlistan
```

- **`LeggiService`** håller texterna, ordlistan och vad som hänt med varje ord. Ett
  uppslag är inget fel: ordet är «öppet» tills det står i en text och läses utan hjälp,
  eller sitter i en repetition. Nästa text är den första olästa inbyggda, sedan den äldsta
  olästa i lagret; när allt är läst den inbyggda med flest öppna ord.
- **Läsordningen** (`readingPath()` i `story.ts`) är grundkursen med _La valigia blu_,
  _Il cane di nessuno_ och _Ciao, bella!_ insprängda, sedan _Alba & Luca_. En följetong med `"course": true` läses varvat med
  grundkursen: varje sida kommer efter grundkursens texter på sidans nivå. Följetongerna
  ligger i `public/data/storie/` och räknas upp i `StoryStore`. Bara en följetong med
  `canon` skrivs om åt läsaren.
- **Startsidan** har två skeden. Först grundkursen: de 13 inbyggda texterna som en rad,
  med en knapp per text, och under den följetongen du står i. En följetong som är läst
  till slut fälls ihop. När den är läst och en berättelse finns fälls den ihop till en
  rad, och berättelsen (`LeggiService.story`, delarna från den senaste del 1) tar platsen
  som ett fönster: de två senast lästa delarna, den du står på och det som ligger på lager.
  Läskortet har «Förra gången» — sammanfattningen Claude skrev av förra delen, bakom ett
  tryck — och raden under visar nivån och andelen på egen hand.
- **`tokenize()`** delar en mening i uppslagbara bitar. Längsta träffen i ordlistan
  vinner, så «ho mangiato» och «c'è» förklaras som en enhet.
- **`buildRipasso()`** väljer repetitionens frågor. Ord repeteras som ord, regler på nya
  ord: ett uppslag i limmet eller orden blir en fråga på just det ordet — ur gymmet om det
  finns en, annars den som följde med texten, annars byggd ur meningen där det stod. Ett
  uppslag i reglerna eller motorn blir en fråga på samma mönster i ett annat ord — den som
  följde med texten om det finns en, annars en ur mazzot för mönstret. Blir rundan kort
  fylls den på med gymmets svagaste taggar.
- **`focusOf()`** i `profile.ts` pekar ut pelaren där uppslagen hopar sig. Det som jämförs
  är andelen uppslag, inte antalet — limmet står i varje mening och skulle annars alltid
  vinna. Är underlaget tunt eller uppslagen jämnt spridda pekas ingenting ut.
- **`levels.ts`** är stegen en text kan ligga på, 1–7. Första läsningen av en text flyttar
  nivån: 97 % eller mer på egen hand ger ett steg upp, under 85 % ett steg ned.
- **`recommend()`** väljer mazzot att satsa på. Två saker talar för ett mazzo: uppslag i
  texterna på former som hör dit, och en tagg som ligger under 60 % i gymmet. Ett mazzo som
  redan sitter sjunker undan. Finns inget som talar för något föreslås det första som inte
  är klarat. Ingen AI är inblandad — rådet finns också utan nyckel.
- **`SupplyService`** är påfyllningen — se _Påfyllning_ nedan.
- **`AiService`** är kopplingen till Claude; `ai-text.ts` är allt runt en text — prompten,
  svarsformatet och kontrollen av det som kommer tillbaka — och `ai-explain.ts` det som
  sägs när läsaren frågar varför, och `ai-book.ts` planen och sidorna i en egen bok. Se
  _Fler texter_ och _Perché?_ nedan. De egna böckerna sparas av `StoryStore` och läggs
  efter böckerna som följer med appen.
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

Appen har ingen server. Nyckeln läggs in under Inställningar, sparas i webbläsarens lagring och
används bara i anrop direkt till Anthropic (`@anthropic-ai/sdk`, som laddas först när det
behövs). Lägg inte in en nyckel på en dator du delar med andra.

- **Ny text.** Claude får pelarna, nivåstegen, listan över mazzi och en inbyggd text som
  mall, och ombeds skriva på läsarens nivå med de senast uppslagna orden invävda. Sticker
  en pelare ut i uppslagen (`focusOf()`) görs texten tät på just den, och mazzin där
  uppslagen hopar sig nämns.
- **Flera åt gången.** En beställning kan vara 1, 3 eller 5 texter (förvalt 3). De skrivs
  en i taget som delar i samma berättelse, och den första öppnas när alla är klara; resten
  ligger på lager. Påfyllningen väntar under tiden. Går en text fel ligger de som hann
  skrivas kvar. Systemprompten är densamma för alla texter i en serie och cachas, så från
  den andra texten läses den till en tiondel av priset; kostnaden räknar med det.
- **Berättelsen.** Varje text från Claude är en del i en berättelse. Med svaret kommer en
  `recap` — två, tre meningar om vad som hänt hittills — och nästa beställning skickar med
  den och förra delen i sin helhet, så att personerna och orden återkommer. Rutan «Fortsätt
  berättelsen» är förvald; avbockad börjar en ny.
- **Frågorna.** I samma svar skriver Claude upp till åtta flervalsfrågor (`ripasso`) på de
  former en läsare troligast slår upp: på ordet självt i en ny mening för limmet och orden,
  på ett annat ord med samma ändelse eller regel för motorn och reglerna. De sparas med
  texten och tas fram av `buildRipasso()` när formen är öppen. En fråga som inte håller
  formen, eller hör till ett ord som inte står i texten, faller bort utan vidare.
- **Egen text.** En inklistrad italiensk text (högst 2 000 tecken) delas i meningar,
  översätts och får en ordlista. Italienskan ska komma tillbaka ordagrant; gör den inte det
  säger appen till.
- **Kontrollen.** Svaret är låst till ett JSON-schema. Därefter gör `assembleText()` samma
  sak som `letture.spec.ts` gör för de inbyggda texterna: varje ord ska ha ett uppslag
  eller vara ett egennamn. Saknas något begärs en komplettering, en gång. Det som ändå
  saknas blir ord utan uppslag, och antalet visas. En egen text läses bara med sin egen
  ordlista, så varje ord är förklarat i sitt sammanhang.
- **Modell.** Opus 5.5 är förvald; Sonnet 5.5 och Haiku 5.5 går att välja. För Opus och
  Sonnet är Anthropics reservmodell på serversidan påslagen (`fallbacks: "default"`), så
  en avböjd begäran prövas på en annan modell i stället för att bara stanna.
- **Kostnad.** Efter varje text visas en ungefärlig kostnad, räknad på listpriserna i
  `AI_MODELS`. Ändras priserna behöver tabellen uppdateras för hand. Förklaringarna under
  _Perché?_ är små och visar ingen kostnad.

Egna texter sparas lokalt och ligger kvar vid «Nollställ allt» — de är innehåll, inte
framsteg.

### Påfyllning

Med en nyckel inlagd och rutan «Fyll på av sig själv» ikryssad (förvalt) gör
`SupplyService` två saker i bakgrunden, en i taget, medan appen är öppen:

- **Två texter på lager.** Så fort färre än två texter från Claude är olästa beställs en
  till, som nästa del i berättelsen. Läskortet och «Nästa text» går vidare till lagret när
  de inbyggda är lästa. Är lagret tomt står det att nästa text skrivs, och knappen blir
  levande när den är klar. En text i lagret är skriven på nivån som gällde när den
  beställdes, så en nivåändring slår igenom först ett par texter senare.
- **Mazzin som byggs ut.** `decksToExtend()` pekar ut ett mazzo när det har övats en och en
  halv gång sin egen storlek, övats de senaste två veckorna och ändå ligger under 85 %.
  Claude får mazzots frågor och läsarens träffsäkerhet per tagg och skriver åtta nya på
  samma punkt (`ai-deck.ts`). Nästa påbyggnad räknas från den förra — tolv försök till —
  och ett mazzo får högst 40 tillskrivna frågor. De märks «ny · Claude» i rundan, sparas
  lokalt och går att ta bort under Inställningar.

Det här drar pengar från kontot utan att någon trycker på något, så det finns spärrar: ett
fel stoppar påfyllningen tills en text till har lästs eller läsaren ber den försöka igen,
ett besök får högst tolv beställningar i bakgrunden, och Inställningar visar vad som förbrukats
härifrån. Frågorna som skrivs till är inte granskade av någon människa.

### Ljud och bibliotek

Ett klipp slås upp på sorts röst och på den exakta italienskan det läser upp — inte på
texten det kom ifrån. Samma replik eller ord ger därför alltid samma klipp, och inget läses
in två gånger. Det som läses in är varje del av varje mening i varje text och varje form i
ordlistorna (`AudioService.wanted`); en form som slutar på apostrof, som «l'», hoppas över.

- **Vem som talar.** En kvinnlig («f») och en manlig («m») röst. `parts()` i `speech.ts`
  delar en mening i det berättaren läser och replikerna inom «…». Texten säger vem som
  berättar (`narrator` — i jag-form den som berättar, «sono andata» är en kvinna), och varje
  mening vem som säger varje replik (`speakers`, en röst per replik i ordning). De inbyggda
  texterna är märkta för hand, och `speech.spec.ts` fäller bygget om en replik saknar röst.
  Claude märker texterna den skriver eller glosar på samma sätt; går rösterna inte jämnt
  upp med replikerna läser berättaren. Orden i uppslaget läses av den kvinnliga rösten.

- **Uppslaget går billigast först.** `AudioService.clip()` tar klippet ur webbläsaren
  (`AudioStore`, IndexedDB) om det finns där — hämtat ur biblioteket eller inläst tidigare.
  Först därefter, och bara med egen nyckel, läser `VoiceService` in det hos ElevenLabs.
  Ett eget klipp går före ett hämtat.
- **Läsvyn.** «Lyssna» spelar texten mening för mening med riktigt ljud om hela texten har
  det, annars med webbläsarens egen italienska röst som förut. Uppslaget har knappar för
  att höra ordet och meningen.
- **Rösterna** väljs en gång under Inställningar. Listorna över röster och modeller hämtas
  från kontot, och bara modeller som kan italienska visas. Samanta och Daniele väljs av sig
  själva om de finns bland kontots röster. Språket låses till italienska i anropet där
  modellen tar emot det, så att ett ensamt «come» inte läses på engelska.
- **Krediter.** Inställningar visar vad som lästs in härifrån, räknat på modellens pris per
  tecken (`model_rates` från ElevenLabs), kontots förbrukning den här perioden
  (`/v1/user/subscription`, om nyckeln får läsa den) och ungefär vad det som saknas skulle
  kosta. Claude-sidan visar på samma ställe vad texterna har kostat i dollar.
- **Paket.** Det som delas ut ligger i paket (`audio-pack.ts`): en fil med klipp och texter
  som beskriver sig själv. Paket läggs till och skrivs aldrig om, så den som redan hämtat
  får bara det nya. Ett paket är högst 4 MB, eftersom Drive tar 5 MB i en enkel uppladdning.
- **Hämta.** `LibraryService.sync()` läser av den publika mappen med en API-nyckel vid
  uppstart, och igen när sidan kommer tillbaka i förgrunden efter tio minuter, och hämtar
  det som är nytt utan att någon trycker. Under tiden står en rad på startsidan; går det
  fel står felet där med en knapp för att försöka igen. Ber webbläsaren om att spara data
  hämtas inget automatiskt, och knappen finns under Ljud i stället. Klippen
  hamnar i ljudlagret, texterna bland de egna som «ur biblioteket», och de räknas in i
  lagret av olästa texter. Ett paket har en röst, så en publicering ger minst ett paket per
  röst.
- **Publicera.** Inloggningen med Google ligger under Inställningar och visas bara när det
  finns något att publicera, när mappen inte är skapad, eller när man redan är inloggad.
  Inloggad laddar Ljud upp ett nytt paket med klippen som
  lästs in sedan sist och texterna från Claude som har lästs. En text som tagits bort, eller
  inte lästs, följer inte med. Bara den som skapade mappen kan skriva i den.

Inget av det här är provat mot de riktiga tjänsterna — bara mot låtsasversioner av dem i en
webbläsare. Två saker avgör om det fungerar på riktigt och är värda att pröva först: att
ElevenLabs API går att anropa direkt från en webbsida, och att en publik mapp går att läsa
med bara en API-nyckel.

### Omslag

Varje följetong har en bildprompt i sin JSON (`cover`) som säger vad framsidan ska visa.
Gemini får tre delar i följd (`coverPrompt()` i `core/cover.ts`):

1. **Mallen** — stilen, densamma för alla böcker så att de ser ut att höra ihop.
   Standardmallen står i `DEFAULT_TEMPLATE` och går att skriva om under Inställningar; en
   egen mall sparas i webbläsaren och kan återställas.
2. **Titeln**, som mallen ber om att få tryckt på omslaget.
3. **Bokens bildprompt** — den ur JSON-filen, eller en egen som skrivs under Ljud.

- **Nyckeln** kommer från Google AI Studio och läggs in under Inställningar, där också
  modellen väljs: Nano Banana 2.1 är förvald, Nano Banana 2 Lite är billigast och Nano
  Banana Pro dyrast. `GeminiService` anropar `generateContent` direkt från webbläsaren,
  med bilden i formatet 3:4.
- **Rita** gör man under Ljud, en bok i taget. Ett nytt omslag ersätter det gamla. Hela
  prompten som skickas går att fälla ut under varje bok.
- **Lagras** gör omslagen i webbläsaren (`CoverStore`, IndexedDB) och visas på startsidan
  bredvid följetongen man står i.
- **Publiceras** gör de i samma paket som ljudet och texterna: huvudet räknar upp
  omslagen (`covers`) och bilderna ligger efter klippen, så att en äldre app läser paketet
  som förut. En besökare hämtar dem av sig själv. Ett senare omslag till samma bok ersätter
  ett tidigare, men ett eget omslag som inte är publicerat än skrivs aldrig över.

Inget av det här är provat mot Googles riktiga API — bara mot en låtsasversion i
webbläsaren. Det första att pröva är att anropet går igenom direkt från en webbsida.

### Google

Det här görs en gång. Besökare loggar aldrig in — de läser med API-nyckeln — så
inloggningen behöver bara fungera för den som publicerar.

**I Google Cloud Console** (`console.cloud.google.com`):

1. Skapa ett projekt.
2. _APIs & Services → Library_: sök «Google Drive API» och tryck _Enable_.
3. _OAuth consent screen_ (heter _Google Auth Platform_ i nyare konsol):
   - användartyp **External**, ett appnamn och din e-postadress;
   - under scopes (_Data access_): lägg till `https://www.googleapis.com/auth/drive.file`;
   - under testanvändare (_Audience_): lägg till ditt eget Google-konto.

   Låt appen stå kvar i läget **Testing**. Då kan bara testanvändarna logga in, och det är
   meningen: du är den enda som publicerar.

4. _Credentials → Create credentials → OAuth client ID_, typ **Web application**. Under
   _Authorized JavaScript origins_: `https://dittnamn.github.io` (bara adressens början,
   utan `/italiano`) och `http://localhost:4200` för `npm start`. Inga redirect-adresser
   behövs. Kopiera **Client ID**.
5. _Credentials → Create credentials → API key_. Öppna nyckeln och begränsa den:
   - _Application restrictions_: **Websites**, med `https://dittnamn.github.io/*` och
     `http://localhost:4200/*`;
   - _API restrictions_: **Restrict key** → bara **Google Drive API**.

   Kopiera nyckeln. Den kommer att synas i sidans kod, och begränsningarna är det som gör
   att den inte går att använda någon annanstans.

**I repot:**

6. Klistra in klient-ID:t som `clientId` och API-nyckeln som `apiKey` i
   `src/app/core/cloud.config.ts`. Pusha, så publiceras sidan.

**I appen**, på den publicerade sidan:

7. Gå till _Inställningar_ och tryck **Logga in med Google**. Välj kontot du lade in som
   testanvändare. Google varnar för att appen inte är verifierad — välj att fortsätta.
8. Gå till _Ljud_ och tryck **Skapa den publika mappen**. Appen skapar mappen i din Drive, gör den läsbar för
   alla med länken och visar dess id. Appen måste skapa mappen själv: med scopet
   `drive.file` får den inte skriva i en mapp du har gjort för hand.
9. Klistra in id:t som `folderId` i `cloud.config.ts` och pusha igen. Först nu hittar andra
   besökare biblioteket.

Därefter: lägg in ElevenLabs-nyckeln under Inställningar och välj röster och modell. Tryck
sedan **Läs in allt som saknas** under Ljud. Logga in med Google under Inställningar och
tryck **Publicera** under Ljud. Inloggningen gäller i ungefär en timme och bara tills sidan
laddas om; efter det loggar du in igen när du ska publicera.

Lägg inget annat i mappen än det appen lägger dit, och inget du inte vill dela — allt i den
är läsbart för vem som helst som har id:t.

### Perché?

`<app-perche>` (`shared/perche.ts`) syns bara när en nyckel är inlagd, och står på tre
ställen: i uppslaget under läsningen, och under facit i gymmet och repetitionen (inte på
para ihop-frågor). Den tar en färdig prompt — `wordPrompt()` med formen, meningen och det
uppslaget redan sagt, eller `answerPrompt()` med frågan, det rätta svaret och det läsaren
valde — och `AiService.explain()` skickar den till den valda modellen på lägsta effort.
Svaret är två till fyra meningar löpande text som skrivs fram medan det kommer. Byter
läsaren ord avbryts anropet. En förklaring som redan hämtats ligger kvar i minnet tills
sidan laddas om, så samma fråga kostar inget en gång till.
