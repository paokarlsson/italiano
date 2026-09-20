# Vad Italiano Companion kan bli

Appen gör redan något som de flesta språkappar missar. Den ställer aldrig om
samma fråga när du svarat fel. Den letar upp en ny fråga på samma punkt. Svarar
du fel på skillnaden mellan sapere och conoscere får du inte tillbaka exakt
samma mening en halv minut senare — du får en annan mening, där samma skillnad
avgör svaret. Det låter som en detalj. Det är det inte. Det är skillnaden mellan
att lära sig ett kort och att lära sig italienska.

Den detaljen är också nyckeln till allt som följer.

## Det appen inte gör

Appen minns hur det går för dig. Den vet att du ligger på fyrtio procent på
partitivartikeln och nittio på hälsningsfraser. Men den har ingen klocka. Den
vet inte att det var elva dagar sedan du senast såg partitivartikeln, och att
just i dag är dagen då den håller på att glida ur dig. Du väljer mazzo själv,
och det man väljer är nästan alltid det man redan är bäst på. Det är mänskligt.
Det är också precis fel.

Det finns hundra år av forskning på när en människa bör repetera för att minnas.
Repetera strax innan du glömmer, så kan intervallet dubblas varje gång. Appen har
redan nästan all data den behöver: hur många gånger varje punkt övats, hur det
gick, och när det senast hände.

## Varför den här appen passar ovanligt bra

I ett vanligt kortprogram är kortet enheten. Du repeterar kort nummer
fyrahundratolv tills du minns att just den framsidan hör ihop med just den
baksidan. Man lär sig kortet, inte innehållet.

Här är enheten i stället övningspunkten. Hundrasjuttiofem punkter över sextiosex
mazzi, och varje punkt har en handfull frågor som testar samma sak från olika
håll. När schemat säger att partitivartikeln ska upp i dag, drar appen en fråga
du inte sett på ett tag. Du kan inte memorera dig förbi det. Du måste kunna
saken.

Den utgångspunkten fanns där från början — inte för att någon planerade för
repetition, utan för att någon tyckte att det var fusk att ställa samma fråga
två gånger.

## Där det spricker

Drygt tusen frågor fördelade på hundrasjuttiofem punkter blir ungefär sex frågor
per punkt. I dag märks det inte. Du plockar ett mazzo, kör åtta frågor, går
vidare.

Med ett repetitionsschema märks det direkt. En punkt du kämpar med kommer
tillbaka efter en dag, två dagar, fyra, en vecka. Efter ett halvdussin varv är
frågorna slut och du börjar känna igen dem. Och lägg märke till vilka punkter det
drabbar: schemat trycker hårdast på det du är sämst på, så de punkter som behöver
flest frågor är exakt de som torkar ut först.

För att bära ett år av repetition behöver en punkt snarare tjugo frågor än sex.
Det är tretusen frågor till. Att skriva dem för hand är inte ett projekt, det är
ett andra jobb.

## Där AI:n kommer in

Inte som en chattbubbla i hörnet. Inte som en funktion att skryta med. Som en
påfyllnadsmekanism för tunna och svaga punkter — och ingenting annat.

Appen kan redan exportera din statistik som en färdig text att klistra in i en
AI. Den texten är i praktiken en beställning: här är de tolv punkter jag är
sämst på, och så här tunna är de. Samma text kan lika gärna gå till ett skript
som ber en modell skriva femton nya frågor på var och en, i exakt det format
appen redan läser.

Det viktiga är var det körs. Appen är en statisk sida på GitHub Pages. Det finns
ingen server, alltså ingen plats att gömma en API-nyckel. Generering hör därför
hemma i bygget, inte i webbläsaren: ett schemalagt jobb som kör en gång i
veckan, skriver nya frågor och öppnar en pull request. Ingenting når appen förrän
du läst igenom ändringen och tryckt merge.

Det låter byråkratiskt. Det är i själva verket poängen.

## Den ärliga risken

En modell som skriver italienskövningar skriver mestadels bra frågor, och då och
då en som är subtilt fel. Fel preposition i ett svarsalternativ. En regionalism
presenterad som standard.

I en vanlig app är en dålig fråga en irritation. I en repetitionsapp är den ett
hot, för hela maskineriet är byggt för att nöta in saker tills de sitter.

Därför granskning före merge. Därför automatisk kontroll av att svaret finns
bland alternativen och att inga dubbletter smyger in. Och därför en markering på
varje genererad fråga, så att de går att mäta — en fråga som nästan alla svarar
fel på är oftare trasig än svår.

## Vägen dit

Tre steg, i den här ordningen.

Först schemaläggaren. Ren logik, några fält till i den sparade statistiken, inga
synliga förändringar. Den kan byggas och testas på en kväll.

Sedan dagens pass. En ny vy på startsidan som säger: nio punkter är förfallna i
dag, vill du köra dem? Kön går tvärs över mazzi och pelare, för glömskan bryr sig
inte om innehållsförteckningar. Det är här allt arbete blir synligt.

Sist generatorn, när schemat börjat tömma poolerna och behovet är mätbart i
stället för påhittat.

De två första stegen är värda att göra även om det tredje aldrig blir av.

## Vad det handlar om

I dag är appen en mycket välgjord övningsbok. Du öppnar den, väljer ett kapitel,
gör övningarna.

Efteråt är den något annat. Den vet vad du håller på att glömma, den frågar om
just det, och den hittar nya sätt att fråga när de gamla är slut. Du öppnar den
och den vet redan vad dagen ska handla om.

Skillnaden mellan en bok och en lärare är att läraren minns vad du hade svårt för
förra veckan.
