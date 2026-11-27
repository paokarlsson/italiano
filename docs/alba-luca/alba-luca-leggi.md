# Alba & Luca i Leggi – uppdrag och specifikation

Det här dokumentet beskriver hur kärlekshistorien *Alba & Luca* ska in i Leggi som en följetong i 45 sidor, med nivåer som stiger med berättelsen. Det är skrivet för AI:n som arbetar i det här projektet. Läs hela dokumentet innan du börjar. Följ arbetsordningen längst ner.

**Källor som ska ligga bredvid den här filen:**
- `varld.md` – kanon: personer, platser, motiv, den låsta sångtexten "La Lanterna".
- `handling.md` – kanon: scen för scen, med låsta repliker.
- Albumets låttexter (*Lontano – Alba & Luca*, 14 spår), som behövs för låtsidorna.

Kanonfilerna bestämmer **vad** som händer. Det här dokumentet bestämmer **hur** det blir lässidor. Om dokumenten säger emot varandra gäller kanonfilerna i sak och det här dokumentet i form.

> Det jag skriver om appens kod nedan bygger på den publicerade versionen (paokarlsson.github.io/italiano), inte på källkoden. **Kontrollera allt mot källkoden** innan du ändrar något.

---

## 1. Berättelsen på en halv sida

Alba Ferrante, 31, är halvsvensk översättare och bor i Boccadasse i Genua. Hon har slutat känna något. Luca Marani, 34, är kock på Trattoria da Rino i Nervi och "alltid närvarande men aldrig där". Från september till mars möts de, blir ihop, och hamnar i en tyst kris när Alba ser sms från Lucas barndomsvän Giulia och inte frågar. De bråkar, går åt varsitt håll, och Alba väljer för första gången att stanna. Berättelsen slutar en kväll i mars i Lucas kök: han nynnar på sången hennes döda mamma sjöng, hon nynnar med, och de säger *"Sei qui."*

**Det som binder ihop historien:**
- Det svenska ordet *stanna*, som betyder både *restare* och *fermarsi*. Alba säger det i sömnen.
- Meningen *"Chi resta non si ferma. Torna."*, som hon inte kan översätta.
- Fyren Lanterna och den gamla sången om den.
- Kaffe och te, och nycklarna.

---

## 2. Appens nivåer (finns redan i appen)

Nivåerna bygger på varandra. Varje nivå innehåller allt från de lägre.

| Nivå | Namn | Grammatik | Max ord per mening |
|---|---|---|---|
| 1 | è och ha | Presens av *essere* och *avere*, artiklar, enkla adjektiv. Inga andra tempus. | 8 |
| 2 | presens | Presens av regelbundna verb, *c'è* och *ci sono*, många kognater (-zione, -tà, -ale, -ico). | 9 |
| 3 | reflexiva och pronomen | Reflexiva verb, *piacere*, objektspronomen (*lo, la, mi, ti, ci*), oregelbundet presens. | 11 |
| 4 | dåtid: passato prossimo | *Passato prossimo* med *avere* och *essere*, regelbundna och vanliga oregelbundna particip. | 12 |
| 5 | dåtid: imperfetto | *Imperfetto*, imperfetto mot passato prossimo, *stare* + gerundium. | 12 |
| 6 | framtid och artighet | Futurum, konditionalis (*vorrei, potresti*), *ci* och *ne*. | 14 |
| 7 | fri text | Fri text på A2–B1: längre meningar, bisatser med *che*, relativsatser, alla tempus ovan. | 18 |

Observera att imperativ inte står med i någon nivå före 7. Undvik det (se tabellen över låsta repliker).

### Nivåplan för berättelsen: grammatiken följer historien

| Del | Nivå | Varför |
|---|---|---|
| Prolog | 1–2 | Bara presentationer av personer och platser. |
| Kapitel 1 | 3 | Nuet. Alba är fast i ett ständigt presens. |
| Kapitel 2–4 | 4 | Det som just har hänt: *ha bruciato il risotto*, *Martin ha detto*. |
| Kapitel 5–11 | 5 | **Imperfetto kommer när de börjar berätta om sina liv.** I Bogliasco: *la mamma cantava*. |
| Kapitel 12–14 | 6 | **Futurum och konditionalis kommer när de börjar tänka framåt.** *La dimenticherò il lunedì*, *potrei dire…* |

Läsaren lär sig dåtid när personerna börjar minnas och framtid när de börjar våga tänka framåt. Rubba inte den här ordningen.

---

## 3. Struktur

```
Berättelse: Alba & Luca (id-prefix: alba-luca)
 ├─ Prolog: 3 sidor
 ├─ Kapitel 1–14 = albumets låtar, 2–4 sidor var
 │    ├─ Sida = ett lässtycke + en fråga
 │    └─ Låtsida (efter varje kapitel): refrängen it/sv + Spotify-länk, ingen fråga, ingen nivå
 └─ Totalt 45 lässidor + 14 låtsidor (+ "La Lanterna" efter kapitel 5)
```

### Regler för en lässida

1. **6–8 meningar** och ungefär 70–100 italienska ord. Ingen mening får vara längre än nivåns ordtak.
2. **Ett ögonblick per sida.** Sidan slutar där scenen naturligt bryts, gärna med en liten krok framåt.
3. **En röst per sida.** Från kapitel 1 berättar Alba och Luca i **jag-form**, precis som i låtarna. Albas sidor har `narrator: "f"` och Lucas `narrator: "m"`. Prologen är i tredje person.
4. **Duetter löses genom växling.** I duettkapitel turas sidorna om mellan dem enligt tabellen i avsnitt 5. En sida har aldrig två berättare.
5. **Repliker** från den andra personen får `speakers: ["m"]` eller `["f"]`, så att rätt röst läser dem.
6. **Grundtempus är presens**, som i låttexterna. Tidigare händelser och minnen använder bara de tempus som nivån tillåter.
7. **Svenskan i `sv`** ska vara naturlig svenska, inte ord-för-ord. Den följer meningen men får skifta ordföljd.
8. **`nota`** innehåller en grammatikpunkt som sidan visar upp, eller en kulturnotis. Exempel: *maniman* är genuesiska, trattorior har ofta stängt på måndagar, svenskans *stanna* motsvarar både *restare* och *fermarsi*.
9. **Högst 5–8 ord per sida** som inte redan finns i appens ordlista. Nya ord läggs till enligt avsnitt 7.
10. **Kanonen gäller.** Hitta inte på nya namngivna personer, platser eller händelser. Det är tillåtet att utelämna saker och att lägga till väder, gäster och småprat, men inget som motsäger kanonfilerna.
11. **Ingen säger "ti amo" högt.** Undantaget är Lucas tanke i sista kapitlet (*potrei dire che ti amo, ma stasera è meglio così*), som inte sägs högt.

### Regler för frågan

- Den ska vara på svenska, ha tre alternativ och exakt ett rätt svar.
- **Svaret ska stå i sidans text.** Det får inte bygga på tolkning av känslor eller på tidigare sidor.
- Felalternativen ska vara rimliga men tydligt fel enligt texten.
- Variera vilket alternativ som är rätt, om appen inte blandar alternativen själv. Kontrollera det i koden.
- Ibland får frågan medvetet peka på ett motiv som kommer tillbaka senare: boken hon luktar på, ordet i sömnen, nycklarna, fyren.

---

## 4. Låsta repliker per nivå

Repliken är låst i **betydelse**. Om en sida ligger på en nivå som inte klarar originalet används nivåversionen. Med nivåplanen ovan behövs få omskrivningar.

| Replik (kanon) | Kapitel | Lägsta nivå | Används på sidan |
|---|---|---|---|
| *Sto bene.* | 1, 13 | 3 | som den är |
| *Che è successo?* | 2 | 4 | som den är |
| *Francese? – Svedese.* | 3 | 1 | som den är |
| *Non bevo caffè dopo le sei.* | 3 | 2 | som den är |
| *È la cosa meno italiana che abbia mai sentito.* | 3 | (konjunktiv) | **nivå 4:** *È la cosa meno italiana che ho mai sentito.* |
| *Questo spiega l'accento, ma non gli occhi.* | 3 | 2 | som den är |
| *Qui il mare non chiede niente. / Lo ringrazio.* (servetten) | 3 | 3 | som den är |
| Martin: *"Jag tror inte att jag nånsin riktigt kände dig."* | 4 | 4 | *Martin ha detto: «Non ti ho mai conosciuta davvero.»* |
| *Sei sempre presente, ma non ci sei mai.* | 5 | 2 | som den är |
| *Ci vediamo domani ❤️* | 8 | 3 | som den är |
| *Sono solo stanca.* | 8 | 1 | som den är |
| *Chi è lei?* (sägs aldrig, bara tänks) | 8 | 1 | som den är |
| *Come stai? – Bene. / Cosa c'è? – Niente.* | 9 | 3 | som den är |
| Davide: *Dalle tempo.* | 9 | (imperativ) | **nivå 5:** *Devi darle tempo.* |
| *Tre settimane, e non hai detto una parola?* | 10 | 4 | som den är |
| *Non dovevo chiedere. Dovevi vedere.* | 10 | 5 | som den är |
| *Chi resta non si ferma. Torna.* (Varaldo) | 11 | 3 | som den är |
| *Non sono brava in questo. Ma voglio imparare. Con te.* | 11 | 3 | som den är |
| *Non siamo quelli di settembre.* | 13 | 1 | som den är |
| *La dimenticherò il lunedì. – Lo so.* | 13 | 6 | som den är |
| *Ho ancora paura. – Ho ancora paura. – Ma non di te. Di perderti.* | 13 | 3 | som den är |
| *Sei qui. – Sei qui.* (berättelsens sista ord) | 14 | 1 | som den är |

Sången "La Lanterna" (texten finns i `varld.md`) är en **autentisk text**. Den förenklas aldrig och visas på en egen låtsida med ordförklaringar.

---

## 5. Sidplan

Varje rad är en sida. `id` följer mönstret `alba-luca-KK-S`, där KK är kapitel (00 = prolog) och S är sida. Kolumnen *Måste med* anger repliker och motiv som sidan inte får tappa.

### Prolog (tredje person)

| id | Titel | Nivå | Röst | Innehåll | Måste med |
|---|---|---|---|---|---|
| alba-luca-00-1 | Alba | 1 | f | 31 år, översättare, från Göteborg, mamman från Genua, liten lägenhet i Boccadasse, katten Sill | – |
| alba-luca-00-2 | Luca | 1 | m | 34 år, kock, Trattoria da Rino i Nervi, trattorian var hans farbror Rinos | – |
| alba-luca-00-3 | La costa | 2 | f | Boccadasse och Nervi, havet, tåget som tar tio minuter, fyren Lanterna långt borta | Lanterna |

### Kapitel 1 – Prima di te (nivå 3, Alba)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-01-1 | L'ultima frase | f | Hon skickar in översättningen och känner ingenting. Det är det som skrämmer henne. | – |
| alba-luca-01-2 | Sto bene | f | Balkongen, te med för mycket honung, Elin ringer | *Sto bene* (nästan sant) |
| alba-luca-01-3 | Il gelato | f | Stranden på kvällen, två gamla som delar en glass, något drar till och hon skjuter bort det | – |

### Kapitel 2 – Qualcosa nell'aria (nivå 4, Luca)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-02-1 | Il mercato | m | Torsdagsmarknaden, kvinnan som luktar på en gammal diktsamling | se exemplet i avsnitt 6 |
| alba-luca-02-2 | Il risotto | m | Han bränner risotton för första gången på flera år. Davide frågar. | *Che è successo?* |
| alba-luca-02-3 | Giovedì | m | Två torsdagar utan henne, sedan kommer hon in i trattorian med boken | boken under armen |

### Kapitel 3 – Le prime parole (nivå 4, växelvis)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-03-1 | Il dolce | m | Hon sitter vid bordet nära köket med vin och boken. Han bär ut efterrätten själv, vilket han aldrig gör. | – |
| alba-luca-03-2 | Svedese | f | Han frågar vad hon läser, gissar på accenten, och hon skrattar. Servetten på väggen. | *Francese? – Svedese.* · servettdikten · *maniman* |
| alba-luca-03-3 | Gli occhi | m | Kaffe efter sex, att hon är halvsvensk, ögonen | *Non bevo caffè…* · *…che ho mai sentito* · *Questo spiega l'accento…* |
| alba-luca-03-4 | Il treno delle dieci | f | Hon rodnar, betalar och går. På tåget ler hon. | – |

### Kapitel 4 – Versione facile (nivå 4, Alba)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-04-1 | Tre volte | f | Promenaden, middagen efter stängning, morgonkaffet hon ger efter för | – |
| alba-luca-04-2 | Martin | f | Hon gillar honom och det skrämmer henne. Minnet av Martin. | *Non ti ho mai conosciuta davvero* |
| alba-luca-04-3 | La versione facile | f | Han berättar sanna saker, hon redigerar sig själv. Vågar hon? | – |

### Kapitel 5 – Notte a Bogliasco (nivå 5, växelvis)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-05-1 | La Lanterna | f | Osterian, utsiktsplatsen, svart hav, fyren långt borta | – |
| alba-luca-05-2 | La canzone | m | Hon berättar om mamman som sjöng när hon tvättade hennes hår. Han kan sången (hans nonna sjöng den) men säger det inte. Han lyssnar utan att laga något. | *la mamma cantava* (imperfetto) |
| alba-luca-05-3 | Chiara | f | Han berättar om Chiara. Hon känner igen meningen som sin egen men säger ingenting. | *Sei sempre presente, ma non ci sei mai.* |
| alba-luca-05-4 | La mano | m | Lång tystnad, sedan tar hon hans hand | – |

Efter kapitel 5 kommer en låtsida med **"La Lanterna"**, i två delar om texten är för lång för en sida.

### Kapitel 6 – Ultima pagina (nivå 5, Luca)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-06-1 | I dettagli | m | Hon läser sista sidan först, honungen, ärret som en trofé, stannar för katter | – |
| alba-luca-06-2 | Stanna | m | Hon pratar svenska i sömnen. Ett ord kommer tillbaka. Han frågar inte. | ordet *stanna* |
| alba-luca-06-3 | Le chiavi | m | Måndagsnycklarna, tisdagsgömmandet, rädslan att förlora det här | – |

### Kapitel 7 – Casa (nivå 5, växelvis)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-07-1 | Dicembre | f | Ingen julresa hem för första gången. Elin blir tyst. | – |
| alba-luca-07-2 | Pepparkakor | m | De brända pepparkakorna, pesto i mortel mot mixer | *In Svezia funzionava.* |
| alba-luca-07-3 | Il divano | f | Lördagsinköp med tre sorters te. Han somnar vid tio, hon lägger en filt över honom och stannar. | – |

### Kapitel 8 – Tutto quello che non ho detto (nivå 5, Alba)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-08-1 | Fuori dal ristorante | f | Giulia skrattar och lägger handen på hans arm. Alba ser det från gatan. | – |
| alba-luca-08-2 | Dieci messaggi | f | Hon ska kolla en bokning och ser tio sms | *Ci vediamo domani ❤️* |
| alba-luca-08-3 | Sono solo stanca | f | Hon drar sig undan. Frågan hon aldrig ställer. | *Sono solo stanca.* · *Chi è lei?* (tanke) |

### Kapitel 9 – Stanza vuota (nivå 5, Luca)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-09-1 | Bene. Niente. | m | Han frågar och får svar som säger motsatsen | *Come stai? – Bene.* · *Cosa c'è? – Niente.* |
| alba-luca-09-2 | Dopo mezzanotte | m | Den släckta trattorian, vinet, samtalet med Davide, rädslan för tiden. Han går inte. Inte än. | *Devi darle tempo.* |

### Kapitel 10 – Due verità (nivå 5, växelvis)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-10-1 | La panchina | f | Bänken i Boccadasse. Hon säger det äntligen. | – |
| alba-luca-10-2 | Giulia | m | Han blir lättad och förklarar Giulias skilsmässa och sitt löfte | – |
| alba-luca-10-3 | Tre settimane | f | Hans sårade fråga och hennes sanning | *Tre settimane…* · *Non dovevo chiedere. Dovevi vedere.* |
| alba-luca-10-4 | Due strade | m | Samma misstag från två håll. De går åt varsitt håll och ingen vänder sig om. | – |

### Kapitel 11 – Resta (nivå 5, Alba)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-11-1 | Una frase | f | Tre tysta dagar och meningen som inte går att översätta | *Chi resta non si ferma. Torna.* |
| alba-luca-11-2 | La sua faccia | f | Hon känner igen mönstret. Hans ansikte var sårat, inte argt. | – |
| alba-luca-11-3 | La porta | f | Tåget, dörren under kvällsservicen. Han ställer ner tallriken. | *Non sono brava in questo. Ma voglio imparare. Con te.* |

### Kapitel 12 – Mattina (nivå 6, Luca)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-12-1 | Il soffitto | m | En stilla morgon med mjukt ljus. Hon sover. Något har förändrats för alltid. | – |
| alba-luca-12-2 | Caffè e tè | m | Han kokar kaffe och te, sätter sig på balkongen och andas. Första tanken framåt (futurum). | – |

### Kapitel 13 – Tutto questo (nivå 6, växelvis)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-13-1 | Febbraio | m | Söndagspromenad, misstagen som gamla foton | *Non siamo quelli di settembre.* |
| alba-luca-13-2 | Stanna | m | Han frågar vad ordet betyder. Hon förklarar både *restare* och *fermarsi*, och mamman. Nu förstår han vad han hörde i november. | – |
| alba-luca-13-3 | La chiave | f | Nyckeln, rädslan, och Elin på kvällen: nu är det sant | *La dimenticherò il lunedì. – Lo so.* · *Ho ancora paura…* · *Sto bene* |

### Kapitel 14 – Noi (nivå 6, växelvis)

| id | Titel | Röst | Innehåll | Måste med |
|---|---|---|---|---|
| alba-luca-14-1 | Marzo | f | Öppna fönster, disken som det vackraste ljudet. Hon hittar lösningen på meningen och skriver den i marginalen. | lösningen i `nota`: *"Den som stannar står inte still. Den kommer tillbaka."* |
| alba-luca-14-2 | Sei qui | m | Han nynnar på "La Lanterna" och hon nynnar med. Han tänker att han kunde säga att han älskar henne. | *Potrei dire che ti amo, ma stasera è meglio così.* · *Sei qui. – Sei qui.* (sista meningen, ingen fråga om slutet behöver det) |

### Låtsidor (efter varje kapitel)

| Kapitel | Låt | Spotify |
|---|---|---|
| 1 | Prima di te | https://open.spotify.com/track/4XRiWNM3Aa51Rl3PzwqJ0k |
| 2 | Qualcosa nell'aria | https://open.spotify.com/track/6OF1YGxN0fWMxmBX0vWzCk |
| 3 | Le prime parole | https://open.spotify.com/track/4GB0zMFK1WCQyxdq0EIA55 |
| 4 | Versione facile | https://open.spotify.com/track/5DJPmtMRmyGQwB5yrmeFfs |
| 5 | Notte a Bogliasco | https://open.spotify.com/track/4NCK36sQzcHNSbMb0x4Zzi |
| 5b | La Lanterna (från `varld.md`) | ingen än (genereras i Suno) |
| 6 | Ultima pagina | https://open.spotify.com/track/4T5YgKNL5axSJvZ10X93SS |
| 7 | Casa | https://open.spotify.com/track/4qBcd2pm71LOtLjHZQtS4s |
| 8 | Tutto quello che non ho detto | https://open.spotify.com/track/6XBHl44nTbFsY1SHxXOPlI |
| 9 | Stanza vuota | https://open.spotify.com/track/5mdqPfYdJi9Wu8YqFKD5QR |
| 10 | Due verità | https://open.spotify.com/track/4oN1dk4CkqFZHejfbK7rec |
| 11 | Resta | https://open.spotify.com/track/5FnJYBZBneyH4de2SnA7MV |
| 12 | Mattina | https://open.spotify.com/track/1D6e1FgpofZz2ZRrK5Ah6y |
| 13 | Tutto questo | https://open.spotify.com/track/0vwkrBk2VnLAbEEpJjdOOJ |
| 14 | Noi | https://open.spotify.com/track/19zpoaWDNjVpMBpIF8Jrir |

En låtsida innehåller refrängen (ur albumets låttexter) rad för rad med svensk översättning, plus länken. Den har ingen fråga och ingen nivå, och märks som *autentisk text*.

---

## 6. Dataformat

### Nuvarande format (`data/letture.json`, observerat)

```
{
  "names":   [ "maria", "luca", ... ],                // egennamn som inte slås upp
  "lexicon": { "ha": { "p": "D1", "sv": "har", "note": "...", "deck": "D1.2" }, ... },
  "texts":   [ {
      "id": "...", "title": "...", "sv": "...", "nota": "...",
      "level": 1-7, "narrator": "f" | "m",
      "sentences": [ { "it": "...", "sv": "...", "speakers": ["f"] } ],
      "question":  { "sv": "...", "options": ["...","...","..."], "answer": 0 }
  } ]
}
```

### Föreslagna tillägg (namnen är förslag, anpassa till koden)

```
"story":   "alba-luca",       // samlar sidorna till en berättelse
"chapter": 2,                 // 0 = prolog
"part":    1,                 // sida inom kapitlet
"kind":    "lettura" | "canzone",
"song":    { "title": "Qualcosa nell'aria", "spotify": "https://..." }   // bara för kind = canzone
```

En låtsida (`kind: "canzone"`) har inget `level` och ingen `question`.

Du väljer om berättelsen ska ligga i `letture.json` eller i en egen fil (till exempel `data/storie/alba-luca.json`) med samma schema. Det beror på hur appen laddar och paketerar innehåll, så titta i koden. En egen fil är att föredra om laddningen tillåter det.

### Exempel: färdig sida

```json
{
  "id": "alba-luca-02-1",
  "story": "alba-luca",
  "chapter": 2,
  "part": 1,
  "kind": "lettura",
  "title": "Il mercato",
  "sv": "Marknaden",
  "level": 4,
  "narrator": "m",
  "nota": "Berättelsen går i presens: compro, rido, torno. Passato prossimo (non ho mai visto) för det som redan hänt.",
  "sentences": [
    { "it": "È giovedì mattina, al mercato di Nervi.", "sv": "Det är torsdag morgon, på marknaden i Nervi." },
    { "it": "Compro il pesce per il ristorante, come sempre.", "sv": "Jag köper fisk till restaurangen, som alltid." },
    { "it": "Vicino ai libri c'è una donna.", "sv": "Vid böckerna står en kvinna." },
    { "it": "Apre un vecchio libro di poesie.", "sv": "Hon öppnar en gammal diktsamling." },
    { "it": "Poi porta il libro al viso e sente l'odore delle pagine.", "sv": "Sedan lyfter hon boken mot ansiktet och luktar på sidorna." },
    { "it": "Rido piano. Lei non mi sente.", "sv": "Jag skrattar tyst. Hon hör mig inte." },
    { "it": "Non ho mai visto una cosa così.", "sv": "Jag har aldrig sett något sådant." }
  ],
  "question": {
    "sv": "Vad gör kvinnan med boken?",
    "options": ["Hon luktar på sidorna", "Hon köper den åt Luca", "Hon läser en dikt högt"],
    "answer": 0
  }
}
```

---

## 7. Ordlista och namn

**Egennamn, som läggs i `names` om de saknas:** alba, luca, giulia, davide, teresa, elin, martin, chiara, rosanna, rino, sill, varaldo, nervi, boccadasse, bogliasco, genova, sturla, svezia, göteborg.

**Ord som behöver poster i `lexicon`** (sv och note), utöver det som redan finns. Detta är en startlista. Lägg till fler när sidorna skrivs:

| Ord | sv | Not |
|---|---|---|
| maniman | ifall att | genuesiska, ett gammalt ord; Alba har det från sin mamma |
| lanterna | lykta; *la Lanterna* = Genuas fyr | stadens symbol |
| trattoria | enkel restaurang | ofta familjedriven |
| traduttrice | översättare (kvinna) | -trice = kvinnlig form av -tore |
| traduzione | översättning | -zione = -tion |
| panchina | bänk | |
| mortaio | mortel | |
| frullatore | mixer | |
| faro | fyr | |
| chiave / chiavi | nyckel / nycklar | |
| restare | stanna kvar | jämför *fermarsi* |
| fermarsi | stanna, stå still | reflexivt; jämför *restare* |
| tornare | komma tillbaka | går med *essere* i passato prossimo |
| miele | honung | |

**`p` och `deck`.** Ta reda på i koden vad fälten betyder (pelare och kortlek, verkar det). Föreslå sedan en lösning, till exempel en egen kortlek för berättelsens ord. Uppfinn inte en struktur som inte passar appen.

---

## 8. Ändringar i appen

1. **Berättelsevy.** Sidorna i en berättelse visas i ordning, med kapitelrubriker (låttitlar). Nästa sida öppnas när den förra är läst. Appens befintliga "Förra gången"-sammanfattning bör användas om den passar.
2. **Sidtypen `canzone`.** Refrängen it/sv med Spotify-länk, utan fråga och utan nivå. Låtsidan visas efter kapitlets sista lässida.
3. **Röster.** `narrator: "f"` är Alba och `"m"` är Luca genom hela berättelsen. Samma ElevenLabs-röster ska användas konsekvent (i dag Samanta och Daniele).
4. **Nivåfilter.** Berättelsen spänner över nivå 1–6. Bestäm hur den visas i förhållande till läsarens nivå. Förslaget är att hela berättelsen visas som en följetong, där varje sida visar sin nivå.
5. **Följetongsläget med Claude** (valfritt, senare): när Claude skriver nya texter "i Alba & Lucas värld" ska `varld.md` och `handling.md` skickas med som ram, med samma regel: utelämna gärna, men motsäg aldrig.

---

## 9. Kontroll (bygg som skript)

Ett valideringsskript ska kontrollera varje sida i berättelsen:

- Antal meningar är 6–8 (prologen får ha 5–8).
- Ingen mening överskrider nivåns ordtak (se avsnitt 2).
- `narrator` stämmer med sidplanen i avsnitt 5.
- Varje låst replik på sidan står med exakt som i tabellen i avsnitt 4.
- `question` har tre alternativ och ett giltigt `answer`.
- Varje ord på sidan finns i `lexicon`, i `names` eller går att slå upp på appens vanliga sätt. Rapportera de som saknas.
- Grammatiken håller sig inom nivån. Det kan inte kontrolleras helt automatiskt, men flagga tydliga tecken: futurumändelser (*-erò, -rai, -rà*) under nivå 6, imperfettoändelser (*-avo, -evo, -ivo, -ava*) under nivå 5, och *ho/ha/hanno* + particip under nivå 4.

---

## 10. Arbetsordning

1. Läs källkoden. Ta reda på hur `letture.json` laddas, hur `level`, `narrator` och `speakers` används, vad `p` och `deck` betyder, och hur ljud och paket fungerar.
2. Föreslå schemaändringarna (avsnitt 6) och appändringarna (avsnitt 8) för användaren innan du bygger dem.
3. Bygg valideringsskriptet (avsnitt 9).
4. **Pilot:** skriv prologen och kapitel 1–3 (13 sidor plus 3 låtsidor). Kör valideringen och visa resultatet för användaren.
5. Efter godkännande: kapitel 4–14 och "La Lanterna".
6. Läs in ljud för alla sidor och kontrollera att Albas och Lucas röster hamnar rätt.
