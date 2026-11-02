# Madplan-appen – specifikation til Claude Code

Nov 2, 2026 · @Alexander

## Formål og overblik

En privat webapp til to personer, der hver uge laver en madplan ud fra aktuelle tilbud i Lidl, Netto, Rema 1000 og Kvickly, det vi allerede har liggende, et budget og makromål, der kan justeres fra uge til uge. Appen skal ikke lanceres. Den skal være enkel at drive og billig at køre.

**Ugens flow**

1. Hent ugens tilbud fra de valgte butikker med ét tryk. Resultatet gemmes, så det kun hentes én gang.
2. Opdatér beholdningen: hvad vi har liggende, og hvad der skal bruges snart.
3. Vælg ugens rammer: dage og måltider, hvem der spiser med, budget og makrotilstand.
4. Generér en plan. Appen viser pris og makroer pr. dag og pr. person med grøn, gul eller rød status.
5. Justér: byt en ret, lås en ret, ændr portioner, eller lav en ny plan, hvor de låste retter bevares.
6. Godkend planen. Appen laver en indkøbsliste pr. butik, som vi begge kan krydse af fra hver vores telefon.
7. Efter indkøb lægges de købte varer i beholdningen med ét tryk, og retterne kan bedømmes.

**Bærende principper**

- Claude (via API) foreslår retter og fortolker rodet tekst. Almindelig kode regner alle priser og makroer ud og afgør, om planen holder sig inden for rammerne.
- Alt, der afhænger af eksterne kilder, har en manuel reserveløsning.
- Simpelt frem for smart: få services og ingen features, der ikke står i denne specifikation.

## Før du starter

Disse ting kan Claude Code ikke gøre for dig. Klar dem først, så byggeriet ikke går i stå undervejs.

- [ ] Installér Node.js (LTS-version) og Claude Code på din computer.
- [ ] Opret et nyt projekt i Supabase (vælg en EU-region). Notér Project URL, `anon`-nøglen og `service_role`-nøglen.
- [ ] Opret en API-nøgle i Claude Console. Den betales pr. forbrug og er adskilt fra et Claude-abonnement. Sæt gerne en lav forbrugsgrænse.
- [ ] Opret en gratis konto hos GitHub og hos Vercel (Hobby-planen). Vercel bruges til at lægge appen på nettet, så den kan åbnes fra jeres telefoner.
- [ ] Download næringsdata fra DTU's fødevaredatabase Frida (frida.fooddata.dk) via sidens eksport/download, og læg filen i projektmappen under `data/frida/`.
- [ ] Find jeres postnummer eller koordinater. Tilbud er lokale, så appen skal vide, hvor I handler.

Nøglerne indsættes i en `.env.local`-fil, som Claude Code opretter. Den fil må aldrig lægges på GitHub.

## Teknisk opbygning

Én Next.js-app på Vercel med Supabase som database og login. Ingen separat backend, ingen køer, ingen ekstra services.

&#91;embedded content: opbygning · telefoner, app og tre eksterne tjenester\]

Kun serverkoden kender nøglerne. Telefonerne henter alt gennem appen og taler aldrig direkte med Tjek, Claude eller databasen med fuld adgang.

| Del | Valg | Hvorfor |
| --- | --- | --- |
| Frontend og server | Next.js (App Router, TypeScript) + Tailwind CSS | Én kodebase. Serverkoden holder API-nøglerne hemmelige. |
| Database og login | Supabase (Postgres + Auth med email og adgangskode) | Du har allerede en konto. |
| AI | Anthropics TypeScript-SDK, kun kaldt fra serveren | Fortolkning af tilbud og forslag til retter. |
| Hosting | Vercel Hobby, deploy fra GitHub | Gratis til privat brug, virker på telefonen. |
| Validering | zod | Tjekker alt, der kommer fra Claude og fra tilbudskilden. |

**Krav til opsætningen**

- Mobil først. Appen skal kunne lægges på hjemmeskærmen som PWA (manifest og ikon) og bruges med én hånd i butikken.
- Login: to konti oprettes manuelt i Supabase, og ny tilmelding slås fra. Al data tilhører én husstand. Row Level Security: kun indloggede brugere må læse og skrive.
- Alle kald til Claude, tilbudskilden og Supabase med `service_role`-nøglen sker i Route Handlers eller Server Actions, aldrig i browseren.
- Modeller styres via miljøvariabler: `CLAUDE_MODEL_PLANNER` (standard `claude-sonnet-5-5`) til madplaner og `CLAUDE_MODEL_FAST` (standard `claude-haiku-5-5`) til fortolkning af tilbud og fritekst.
- Svar fra Claude hentes som struktureret JSON via tool use med et skema, valideres med zod og forsøges igen én gang ved fejl.
- Databaseskemaet ligger som SQL-migrationer i `supabase/migrations/`. Kør dem med Supabase CLI via npx. Hvis det driller, så giv mig SQL'en til at indsætte i Supabase's SQL-editor.
- Planlægning kan tage mange sekunder. Tjek Vercels aktuelle tidsgrænse for serverfunktioner, og del genereringen op i trin med statusvisning, hvis den rammer grænsen.
- Dansk brugerflade, kroner, uger starter mandag, tidszone Europe/Copenhagen.

**Miljøvariabler**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL_PLANNER`, `CLAUDE_MODEL_FAST`.

## Skærme og funktioner

Syv skærme med en bundmenu til de fem mest brugte. Hver skærm skal fungere på en telefonskærm uden vandret scroll.

| Skærm | Indhold og handlinger |
| --- | --- |
| Denne uge (forside) | Ugens plan dag for dag. Budgetmåler (forbrug mod ramme). Makrostatus pr. person pr. dag med grøn, gul eller rød. Pr. ret: se opskrift, byt, lås, ændr portioner, markér som lavet. |
| Planlæg uge | Trin for trin: 1) dage og måltider i et gitter, og hvem der spiser med, 2) budget, 3) makrotilstand, 4) gennemgå "brug snart" i beholdningen, 5) ønsker i fritekst ("noget med fisk", "hurtigt onsdag"), 6) generér. |
| Tilbud | Ugens tilbud pr. butik med søgning og kategorifilter. Markér et tilbud "skal med" eller "nej tak". Knapper: hent tilbud igen, manuel import. |
| Beholdning | Varer grupperet i køleskab, fryser og skab. Hurtig tilføjelse i fritekst. "Brug snart"-markering. Basisvarer. |
| Indkøbsliste | Grupperet pr. butik og derefter afdeling (frugt og grønt, kød, mejeri, kolonial, frost). Afkrydsning, pris pr. linje og total. Egne ekstra varer (fx toiletpapir) vises for sig og tæller ikke i madbudgettet. Knap: læg købte varer i beholdningen. |
| Opskrifter | Gemte retter med bedømmelser og favoritter. Brug en ret igen i en ny uge. |
| Indstillinger | Personer og makromål, butikker og placering, standardmåltider, ting vi ikke spiser, allergier, maks. tilberedningstid på hverdage, prisliste for normalpriser, måltidsandele. |

**Handlinger på en ret**

- **Byt**: vis tre alternativer, der passer ind i resten af ugens budget og makroer, og lad os vælge.
- **Lås**: retten bevares, når planen genereres igen.
- **Portioner**: ændr antal spisende for netop det måltid (fx gæster tirsdag). Pris, makroer og indkøbsliste opdateres med det samme.
- **Markér som lavet**: trækker ingredienserne fra beholdningen (fase 6) og beder om en bedømmelse.

## Tilbudsdata

Tilbud hentes fra Tjek, som er datakilden bag eTilbudsavis. Endpointet kræver hverken login eller nøgle, men det er ikke officielt dokumenteret til privat brug, så det kan ændre sig uden varsel. Derfor bygges tilbudskilden som et udskifteligt modul med en manuel reserveløsning. ([kilde](https://apify.com/gratifying_graph/nordic-grocery-offers.md))

**Hentning**

- Byg et modul `lib/offers/tjekSource.ts` bag et fælles interface `OfferSource` (`fetchOffers(location, stores, week) → RawOffer[]`). Den manuelle import implementerer samme interface.
- Udgangspunkt for endpointet (verificér først med et lille testkald, og stop og spørg mig, hvis det ikke svarer som forventet): API'et har historisk ligget under `https://squid-api.tjek.com/v2` med ressourcer som `dealers`, `catalogs` og `offers` og parametre som `dealer_ids`, `r_lat`, `r_lng`, `r_radius`, `limit` og `offset`.
- Tilbud er lokale. Brug husstandens koordinater og en radius fra indstillingerne (standard 10 km). Koordinater skal ligge i Danmark.
- Læs hele tilbudsaviserne for de fire kæder i stedet for at søge på enkelte ord. En produktsøgning giver højst 100 resultater pr. søgeord, og en hel avis dækker alt. Find kædernes `dealer`-id'er via API'et ved navn, og gem dem i tabellen `stores`. Hardcod dem ikke.
- Kæderne udgiver næste uges avis et par dage før. Gem gyldighedsdatoerne, og vælg de tilbud, der gælder på husstandens indkøbsdag.
- Høflig brug: ét kald ad gangen med en kort pause, højst én fuld hentning pr. dag, og cache rådata i databasen. Knappen "Hent tilbud igen" respekterer samme grænse.

**Datakvalitet, som koden skal håndtere**

- Varenavnet er fritekst. Førpris findes kun på en mindre del af tilbuddene, og stregkode og kategori mangler typisk.
- Pakkestørrelse er tekst, fx `400 g`, `120-500 g` eller `24 x 33 cl`. Multikøb som "2 for 90,-" står som én samlet pris for flere enheder.
- Beskrivelsen kan indeholde betingelser som "ved køb af flere end 6 stk.". Den beregnede enhedspris kan være forkert, hvis prisen indeholder pant.
- Kataloger kan indeholde nonfood. Kun dagligvarekataloger og madvarer bruges.

**Normalisering (Claude, hurtig model)**

Rå tilbud sendes i portioner på cirka 50 til `CLAUDE_MODEL_FAST`, som for hvert tilbud returnerer: `is_food`, `category` (frugt\_grønt, kød, fisk, mejeri\_æg, brød, kolonial, frost, drikke, snacks, andet), `ingredient_name` (generisk dansk navn, fx "hakket svinekød 8-12%"), `pack_count`, `pack_size`, `pack_unit` (g, ml eller stk), `total_price`, `min_purchase` og `conditions`. Kilo- og literpris regnes ud i kode. Resultatet gemmes pr. tilbuds-id, så samme tilbud aldrig normaliseres to gange. Tilbud med usikker fortolkning markeres og vises med et advarselsikon.

**Manuel reserveløsning**

- Indsæt tekst kopieret fra en tilbudsavis, eller upload et eller flere screenshots. Claude udtrækker tilbuddene til samme normaliserede format.
- En simpel formular til at tilføje ét tilbud i hånden.
- Hvis Tjek fejler, viser appen en tydelig besked og et link til den manuelle import i stedet for en tom side.

## Beholdning

Planen bygges først på det, vi har liggende, og derefter på tilbud. Varer fra beholdningen koster 0 kr. i ugens budget, og varer markeret "brug snart" skal bruges tidligt på ugen.

**To slags varer**

| Type | Eksempler | Regler |
| --- | --- | --- |
| Beholdningsvare | Pasta, kartofler, spidskål, frossen kylling | Mængde er valgfri. Placering: køleskab, fryser eller skab. Kan markeres "brug snart" med en valgfri dato. Trækkes fra, når en ret laves. |
| Basisvare | Salt, peber, olie, mel, sukker, bouillon, krydderier, soja | Antages altid at være hjemme. Koster 0 kr., trækkes ikke fra og kommer kun på indkøbslisten, hvis den markeres "løbet tør". |

**Mængder må være upræcise**

Mængde og enhed er valgfri. En vare uden mængde behandles som "nok til én ret". Når en ret kræver mere end det, vi har, købes resten og vises som en linje på indkøbslisten.

**Hurtig tilføjelse**

- Et fritekstfelt: "500 g pasta, 2 kg kartofler, 1 spidskål, en halv pakke smør". `CLAUDE_MODEL_FAST` fortolker teksten til varer med navn, mængde, enhed og et gæt på placering.
- Appen viser en forhåndsvisning, som vi godkender eller retter, før noget gemmes.
- En afkrydsningsliste med almindelige basisvarer til første opsætning.
- Plus- og minusknapper på hver vare til hurtige rettelser.

**Sådan holdes beholdningen opdateret**

1. Efter indkøb: "Læg købte varer i beholdning" tilføjer alle afkrydsede varer med hele pakkens mængde (fase 5).
2. Når en ret markeres som lavet, trækkes de planlagte mængder fra (fase 6).
3. Ved ugens afslutning viser appen, hvad der er tilbage af åbnede pakker, fx "200 g hakket svinekød – frys ned?".
4. Alt kan altid rettes i hånden.

## Måltider, personer og makroer

Hver person har sine egne dagsmål, og hver uge vælges en makrotilstand pr. person. Samme ret laves til begge, men portionerne skaleres pr. person.

**Personer**

Hver person har navn og dagsmål for kalorier, protein, kulhydrat og fedt. Målene indtastes i indstillingerne og kan overskrives for en enkelt uge.

**Ugens måltidsgitter**

- Et gitter med ugedage mandag til søndag og måltidstyperne morgenmad, frokost, aftensmad og snack.
- Hver celle: til eller fra, hvem der spiser med (begge, kun den ene), og antal gæster.
- Frokost kan sættes til "rester fra aftensmaden dagen før". Så laves aftensmaden i ekstra portioner, og frokosten koster ikke noget ekstra.
- Standardgitteret gemmes i indstillingerne, så en normal uge kræver nul klik.
- Gæster får en standardportion fra indstillingerne (fx 700 kcal til aftensmad) og tæller ikke i nogens makroer.

**Måltidsandele**

Målene gælder hele dagen, men planen dækker måske kun aftensmad. Hver måltidstype har derfor en andel af dagens energi: morgenmad 20 %, frokost 30 %, aftensmad 35 % og snack 15 % (kan rettes). Målet for en dag er summen af andelene for de planlagte måltider gange dagsmålet. Appen viser fx "Planen dækker 35 % af dagens mål".

**Makrotilstande** (vælges pr. person pr. uge, tolerancer kan rettes i indstillingerne)

| Tilstand | Hvad tjekkes | Standardtolerance |
| --- | --- | --- |
| Fri | Ingen makrokrav, kun budget | – |
| Minimum | Protein mindst X g pr. dag, valgfrit kalorieloft | Protein må ikke ligge under |
| Balanceret | Kalorier og protein. Dagene må svinge, men ugens gennemsnit skal ramme målet | Kalorier ±10 %, protein ikke under |
| Skarp | Kalorier, protein, kulhydrat og fedt hver dag | Kalorier ±5 %, makroer ±10 % |

Status pr. dag og person: grøn inden for tolerancen, gul op til dobbelt tolerance, rød længere væk.

**Portioner pr. person**

Portionsfaktoren er personens mål for måltidet delt med rettens kalorier pr. grundportion, begrænset til 0,5–2,0. I Skarp-tilstand viser opskriften gram pr. person for hver ingrediens ("Dig: 180 g ris, Kæreste: 120 g ris"), så maden kan vejes ud.

**Næringsdata**

- Kilde: DTU's fødevaredatabase Frida (version 5.5). Den har intet offentligt API, men datasættet kan downloades. ([kilde](https://glama.ai/mcp/servers/zht3o3m42t), [version](<https://www.fao.org/food-composition/tables-and-databases/detail/(denmark--2024)-danish-food-composition-table/en>))
- Et script `scripts/import-frida.ts` læser filen i `data/frida/` og fylder tabellen `foods` med kalorier, protein, kulhydrat, fedt og fiber pr. 100 g. Frida fik ny brugerflade i juni 2026, så scriptet skal først vise filens kolonner og spørge mig, hvis formatet er uklart.
- Ingrediens til fødevare: hent 10 kandidater med Postgres-udvidelsen `pg_trgm`, og lad `CLAUDE_MODEL_FAST` vælge den bedste eller svare "ingen". Gem valget i `ingredient_food_map`, så hver ingrediens kun matches én gang.
- Alt regnes på rå vægt. Opskrifter angiver altid rå gram.
- Findes intet match, estimerer Claude værdier pr. 100 g. De markeres som estimat og vises med "≈" i appen.

## Budget, priser og pakker

Budgettet dækker alt, planen kræver, at vi køber. Det regnes ud i kode med hele pakkepriser, aldrig med pris pr. gram.

**Budget**

- Ugebudget i kroner, sat pr. uge med en standard fra indstillingerne.
- To typer: **loft** (planen må ikke overstige beløbet) eller **mål** (må gå op til 10 % over med gul advarsel).
- Varer fra beholdningen og basisvarer koster 0 kr. Egne ekstra varer på indkøbslisten tæller ikke med.

**Hvor prisen kommer fra** (i denne rækkefølge)

1. Et tilbud, der gælder på indkøbsdagen i en af de valgte butikker.
2. Normalprisen fra husstandens prisliste.
3. Et estimat fra Claude. Det vises med "≈", og appen beder os rette det. Rettelsen gemmes i prislisten.

**Prislisten**

En tabel med normalpriser på almindelige varer: navn, pris, pakkestørrelse og evt. butik. Den startes med cirka 100 almindelige varer med estimerede priser markeret som estimat. Vi retter dem løbende. På indkøbslisten kan man trykke på en pris for at rette den, og så opdateres prislisten.

**Pakkestørrelser**

- Vi betaler for hele pakker. Pris = antal pakker × pakkepris. Resten går i beholdningen.
- Planlæggeren belønnes for at bruge resten af en pakke senere på ugen (fx 500 g hakket kød fordelt på to retter).
- Multikøb ("2 for 90,-"): købes som hele bundter. Resten går i beholdningen.
- Ved ugens slutning vises gram, der forventes at blive tilovers, som en simpel spildindikator.

**Valg af butikker**

- Indstilling: højst antal butikker pr. uge (standard 2), og en primær butik til varer, der ikke er på tilbud.
- Butiksvalget regnes ud i kode: med fire kæder er der højst 15 kombinationer, så prøv dem alle, og vælg den billigste inden for grænsen.
- Indkøbslisten viser total, pris pr. dag og pris pr. portion.

## Sådan laves madplanen

Claude foreslår, koden regner, og Claude retter til i højst to runder. Ingen tal fra Claude bruges direkte i budget eller makroer.

&#91;embedded content: planlægning · forslag, beregning og tilretning\]

Efter anden tilretning vises planen altid, også hvis den ikke holder, med en forklaring af hvad der mangler.

**1. Saml input (kode)**

- Ugens måltidsgitter, personer, mål og makrotilstande, budget og indkøbsdag.
- Gyldige, normaliserede madtilbud fra de valgte butikker. Send dem kompakt, én linje pr. tilbud: id, navn, butik, pakke, pris, kilopris, samt kalorier og protein pr. 100 g, når de kendes. Udregn også pris pr. 100 g protein, så Claude kan finde billigt protein.
- Beholdning ("brug snart" først) og basisvarer.
- Låste retter, tilbud markeret "skal med" eller "nej tak", ting vi ikke spiser, allergier og maks. tilberedningstid.
- Retter fra de sidste tre uger (undgå gentagelse), retter med tommel op (gerne igen) og ugens fritekstønsker.

**2. Forslag (Claude, `CLAUDE_MODEL_PLANNER`)**

Svaret er JSON med én ret pr. måltid: titel, kort beskrivelse, grundportioner, tilberedningstid, korte trin og ingredienser. Hver ingrediens har navn, rå gram og kilde: `offer` (med tilbuds-id), `pantry` (med vare-id), `staple` eller `buy`.

Regler i prompten:

- Almindelig dansk hverdagsmad inden for tilberedningstiden.
- Brug "brug snart"-varer tidligt på ugen, og brug resten af åbnede pakker.
- Variér proteinkilder, og respektér ting vi ikke spiser og allergier.
- Tilbud markeret "skal med" skal bruges. Brug kun tilbuds-id'er fra listen, og opfind aldrig tilbud.

**3. Beregn (kode)**

Ingredienser matches til fødevarer, og makroer regnes ud. Derefter: pakkepriser og butiksvalg, portionsfaktorer pr. person, status pr. dag og person, budgetstatus og forventede rester.

**4. Ret til (Claude, højst to runder)**

Hvis noget er rødt eller over budget, sendes planen tilbage med en kort liste over konkrete brud med tal, fx "Onsdag: Person A mangler 28 g protein" eller "Budget overskredet med 64 kr.". Claude skal lave de mindst mulige ændringer og må ikke røre låste retter. Derefter regnes der igen.

**5. Vis**

Planen vises med status. Lykkes det ikke efter to runder, vises den bedste plan med en klar forklaring af, hvad der ikke holder, og forslag som "hæv budgettet med 50 kr." eller "skift til Balanceret". Planen må aldrig fejle i stilhed.

**Byt en ret**

Samme forløb for ét måltid: Claude får resten af planen, det resterende budget og makrohullet og foreslår tre alternativer. Koden regner dem ud og viser deres effekt, fx "+12 kr., +8 g protein".

**Læring og drift**

- Tommel op gemmer retten som favorit, som Claude må foreslå igen. Tommel ned betyder aldrig igen.
- Prompts ligger som separate filer på dansk i `lib/ai/prompts/`.
- Hvert kald til Claude logges i tabellen `ai_calls` med model og tokens, så forbruget kan følges.

## Datamodel

Femten tabeller i Supabase. Alle har Row Level Security slået til med fuld adgang for indloggede brugere. Generér TypeScript-typer fra skemaet. Kolonnenavnene er et udgangspunkt, som Claude Code må forbedre, hvis det giver et enklere design.

| Tabel | Vigtigste kolonner | Formål |
| --- | --- | --- |
| `people` | name, user\_id (valgfri), kcal, protein\_g, carbs\_g, fat\_g | Personer og dagsmål |
| `settings` | lat, lng, radius\_km, shopping\_day, max\_stores, primary\_store\_id, default\_budget, budget\_type, default\_meal\_grid, meal\_shares, tolerances, guest\_portion\_kcal, max\_prep\_weekday\_min, dislikes, allergies | Husstandens indstillinger (én række) |
| `stores` | name, tjek\_dealer\_id, enabled | De fire kæder |
| `offers` | store\_id, source (tjek, manual), external\_id (unik), raw, heading, price, quantity\_text, valid\_from, valid\_until, image\_url, fetched\_at + normaliseret: is\_food, category, ingredient\_name, pack\_count, pack\_size, pack\_unit, total\_price, min\_purchase, conditions, needs\_review, food\_id | Rå og normaliserede tilbud |
| `foods` | frida\_id, name\_da, kcal, protein, carbs, fat, fiber (pr. 100 g), source (frida, estimate) | Næringsdata |
| `ingredient_food_map` | ingredient\_name (nøgle), food\_id, confidence | Cache over matchede ingredienser |
| `pantry_items` | name, quantity, unit, location, use\_soon, use\_by, is\_staple, out\_of\_stock, food\_id | Beholdning og basisvarer |
| `price_list` | name, price, pack\_size, pack\_unit, store\_id, is\_estimate | Normalpriser |
| `recipes` | title, description, base\_servings, prep\_minutes, steps, tags, rating (-1, 0, 1), favorite, created\_by | Gemte retter |
| `recipe_ingredients` | recipe\_id, name, grams\_raw, food\_id | Rettens ingredienser |
| `week_plans` | week\_start, status (draft, approved, done), budget, budget\_type, macro\_modes, meal\_grid, wishes, totals | Én plan pr. uge |
| `planned_meals` | plan\_id, date, meal\_type, recipe\_id, locked, servings, portion\_factors, cooked\_at, computed\_status | Måltider i planen |
| `planned_ingredients` | planned\_meal\_id, name, grams\_raw, source, offer\_id, pantry\_item\_id, food\_id, cost\_dkk | Hvor hver ingrediens kommer fra |
| `shopping_list_items` | plan\_id, store\_id, name, packs, pack\_size, pack\_unit, price\_dkk, offer\_id, is\_extra, checked, checked\_by | Indkøbslisten |
| `ai_calls` | purpose, model, input\_tokens, output\_tokens, created\_at | Forbrug af Claude-kald |

## Byggeplan i faser

Syv faser, hver med et tydeligt færdig-kriterie, som jeg selv kan afprøve. Byg én fase ad gangen, og stop efter hver fase, så jeg kan teste den, før næste fase begynder.

0. **Opsætning**: Next.js-projekt med Tailwind, forbindelse til Supabase, login med to konti, tom bundmenu, PWA-manifest og første deploy til Vercel.
   - Færdig når: vi kan logge ind fra telefonen via Vercel-adressen.
1. **Grunddata**: migrationer for alle tabeller, indstillingsskærmen (personer, mål, butikker, placering, måltidsgitter, andele, tolerancer), beholdning med hurtig tilføjelse, basisvarer og prisliste med startdata.
   - Færdig når: "500 g pasta, 1 spidskål, 2 kg kartofler" bliver til tre varer i beholdningen efter godkendelse.
2. **Tilbud**: verificér Tjek-endpointet med et testkald, find kædernes id'er, hent og cache aviser, normalisér med Claude, Tilbud-skærmen og manuel import med tekst og screenshot.
   - Færdig når: ugens madtilbud fra de fire kæder vises normaliseret, og en indsat tekstbid fra en tilbudsavis bliver til tilbud.
3. **Næringsdata**: import af Frida, `pg_trgm`, matching med cache, estimat som reserve og beregningsfunktioner for makroer med enhedstests.
   - Færdig når: "hakket svinekød 8-12%" og "spidskål" får korrekte værdier pr. 100 g, og testene er grønne.
4. **Madplan**: saml input, planlægningsprompt, beregning (pakkepriser, butiksvalg, portioner, status), tilretningsløkken, Denne uge-skærmen, Planlæg uge-guiden samt lås og byt.
   - Færdig når: en uge med fem aftensmåltider til to personer på 700 kr. i Balanceret genereres med korrekt status, og byt og lås virker.
5. **Indkøbsliste**: generering, gruppering pr. butik og afdeling, afkrydsning fra begge telefoner, ekstra varer, ret en pris (opdaterer prislisten) og "læg købte varer i beholdning".
   - Færdig når: vi kan handle efter listen på to telefoner, og de købte varer lander i beholdningen.
6. **Afrunding**: "markér som lavet" trækker fra beholdningen, bedømmelser og favoritter, rester ved ugens slutning, opskriftsskærmen, tomme tilstande og fejlbeskeder.
   - Færdig når: en hel uge kan køres fra planlægning til sidste måltid uden at åbne Supabase.

## Ikke med i første version

Disse ting bygges ikke nu, heller ikke delvist. De står her, så designet ikke spærrer for dem senere.

**Bevidst udeladt**

- Offentlig tilmelding, flere husstande og betaling.
- Forbindelse til butikkernes apps, kundekort eller onlinebestilling.
- Lagerstatus i butikkerne.
- Automatisk hentning på et fast tidspunkt. I første version hentes tilbud via knappen, eller når appen åbnes, og data er mere end tre dage gamle.

**Idéer til senere**

- Besked på telefonen, når næste uges tilbudsaviser er ude.
- Open Food Facts til mærkevarer og stregkodescanning til beholdningen.
- Prishistorik, så appen kan sige "laveste pris i 8 uger".
- Live-opdatering af indkøbslisten mellem telefonerne (Supabase Realtime), hvis genindlæsning ikke er nok.
- En beregner, der foreslår dagsmål ud fra alder, vægt og aktivitet.
- Ugeplanen som billede eller PDF til køleskabet.
- Flere kæder, fx Føtex, Bilka og 365discount. Det bør kun kræve en ny række i `stores`.

## Arbejdsregler for Claude Code

Jeg har minimal erfaring med kode og hosting. Arbejd i små, afprøvelige skridt, og fortæl mig præcist, hvad jeg selv skal gøre.

- Vis en kort plan for hver fase, før du skriver kode.
- Efter hver fase: forklar på dansk i få linjer, hvad der er bygget, og hvordan jeg afprøver det. Når noget kræver mig (Supabase, Vercel, nøgler), så skriv præcis, hvad jeg skal klikke på og indtaste.
- Hold det simpelt. Tilføj ingen biblioteker eller tjenester, som ikke er nødvendige, og spørg før en ny tjeneste.
- Al beregning af priser, pakker, butiksvalg, portioner og makrostatus ligger som rene funktioner i `lib/calc/` med enhedstests (Vitest).
- Alt fra Claude og Tjek valideres med zod. Fejl vises som forståelige beskeder i appen, aldrig som en tom side.
- Hemmeligheder findes kun i `.env.local` og i Vercels miljøvariabler. Læg en `.env.example` uden værdier i projektet.
- Lav et seed-script med to personer, en lille beholdning og et sæt eksempeltilbud, så alt kan afprøves uden Tjek.
- Commit efter hver fase med en beskrivende besked, og push til GitHub, så Vercel deployer.
- Hold en `CLAUDE.md` i projektet opdateret med vigtige beslutninger og med hvordan appen køres lokalt, så en ny session kan fortsætte.
- Er noget i denne specifikation uklart eller modstridende, så spørg i stedet for at gætte.
