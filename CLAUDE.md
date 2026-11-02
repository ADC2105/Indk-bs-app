# Madplan-appen – CLAUDE.md

Se `SPEC.md` for den fulde specifikation. Denne fil holder styr på beslutninger og hvordan appen køres, så en ny session kan fortsætte.

## Status

- **Fase 0 (Opsætning): færdig og testet.** Next.js-skelet, Supabase-login, tom bundmenu, PWA-manifest. Login bekræftet fra telefon via Vercel-adressen `madplan-app-weld.vercel.app`.
  - Husk: Vercel-projektets Framework Preset skal stå på "Next.js" (ingen build/output-overrides) – blev rettet manuelt efter første deploy.
- **Fase 1 (Grunddata): færdig og testet.** Alle 15 tabeller migreret, Indstillinger (personer, butikker, måltidsgitter, måltidsandele, budget m.m.), Beholdning med AI-tolket hurtig tilføjelse, basisvare-checkliste og seed-data (2 personer, lille beholdning, eksempeltilbud, ~90 estimerede priser). Bekræftet i produktion: fritekst → beholdning, og indstillinger gemmer.
  - Faldgrube at huske: filer med `"use server"` må kun eksportere async-funktioner. Konstanter (DAYS, MEAL_TYPES) lå først i `indstillinger/actions.ts` og gav en ødelagt reference i produktion (men ikke lokalt/i build) – flyttet til egen `constants.ts`. Tjek for dette mønster, hvis en ny "virker lokalt, fejler i prod"-fejl dukker op i en `actions.ts`-fil.
- **Fase 2 (Tilbud): færdig og testet.** Tjek-endpointet er verificeret med live testkald (`https://squid-api.tjek.com/v2`). Kædernes dealer-id'er fundet og hardkodes ikke - de caches i `stores.tjek_dealer_id`, første gang de slås op:
  - Lidl `71c90`, Netto `9ba51`, Rema 1000 `11deC`, Kvickly `c1edq`.
  - `lib/offers/tjekSource.ts` bag `OfferSource`-interfacet henter kataloger inden for radius, vælger ugens dagligvarekatalog (heuristik: label indeholder "uge", fx "Netto uge 45"; nonfood-kataloger som jule-/legetøjs-/vinkataloger frasorteres), og paginerer alle tilbud (maks. 100 ad gangen, ét kald ad gangen med pause). Højst én fuld hentning pr. dag (tjekkes på `offers.fetched_at` for `source='tjek'`).
  - `lib/ai/offerNormalize.ts` normaliserer i portioner af 50 med `CLAUDE_MODEL_FAST`. Kun tilbud uden `ingredient_name` normaliseres (aldrig to gange).
  - `lib/calc/unitPrice.ts` regner kilo-/literpris i kode (ikke AI), med Vitest-tests (`npm run test`).
  - Manuel import (`/tilbud/import`): tekst eller screenshots → samme AI-udtræk (`lib/ai/offerExtract.ts`), samt en håndformular. Serverens body-size-grænse er hævet til 10 MB (`next.config.ts`) for screenshot-upload.
  - Bekræftet i produktion: "Hent tilbud igen" og manuel import virker begge.
- **Fase 3 (Næringsdata): færdig og testet.** Frida hedder nu "FCDB" (Den Danske Fødevaredatabase) og har fået nyt format, version 6.1 maj 2026 - en relationel Excel-eksport (ark: Food, Parameter, Data_Normalised m.fl.), ikke en simpel liste.
  - `scripts/import-frida.mjs` læser `data/FCDB_6.1_Dataset.xlsx`, henter kcal/protein/kulhydrat/fedt/fiber pr. fødevare fra `Data_Normalised` (ParameterID 356/218/172/141/168) og importerer til `foods`. 1389 fødevarer importeret. Kør med `npm run import-frida`.
    - "Kulhydrat" = "Tilgængelig kulhydrat" (ParameterID 172), ikke "Kulhydrat difference" - matcher det, danske næringsdeklarationer viser.
    - `data/`-mappen er lokal og git-ignoreret (ligesom `.env.local`) - læg filen der igen, hvis du arbejder fra en ny maskine.
  - `lib/foods/matchIngredient.ts`: cache (`ingredient_food_map`) → `pg_trgm`-kandidater (Postgres-funktionen `match_foods_by_trigram`) → Claude vælger bedste match eller estimerer. Koblet på Beholdningens "hurtig tilføjelse", så varer får næringsdata (estimater vises med "≈").
    - Bekræftet med SPEC.md's egne eksempler: "hakket svinekød 8-12%" → "Grisekød, hakket, 5-10% fedt, råt", "spidskål" → "Spidskål, rå".
  - `lib/calc/macros.ts`: skalering af næring pr. mængde, portionsfaktor (0,5-2,0), måltidsandele, grøn/gul/rød-status - med Vitest-tests.
  - Faldgrube at huske: i et Claude tool-use-skema skal felter, der kun er relevante i den ene gren af et enten/eller-svar (fx "estimate" når der i stedet blev fundet et match), være `.nullish()` i zod, ikke kun `.nullable()` - Claude udelader typisk hele feltet i stedet for at sende `null`, og `.nullable()` afviser en manglende nøgle.
  - Bekræftet i produktion: Beholdning viser kcal, protein, kulhydrat og fedt pr. 100 g for tilføjede varer.
- Fase 4–6: ikke startet, se `SPEC.md` → "Byggeplan i faser".

## Arkitekturvalg

- **Next.js 16** (App Router, TypeScript), **React 19**, **Tailwind CSS 4** via `@tailwindcss/turbopack`. Scaffoldet med `create-next-app`.
- Next 16's nye "Cache Components"-funktion (`cacheComponents`/`partialPrefetching` i `next.config.ts`) er slået **fra** igen. Appen er pr. design dynamisk og pr.-bruger (auth, budget, beholdning), så den eksperimentelle cache-model gav ingen fordel og kun ekstra kompleksitet.
- **Auth**: Supabase Auth (email/adgangskode) via `@supabase/ssr`.
  - `lib/supabase/client.ts` – browser-klient.
  - `lib/supabase/server.ts` – server-klient (Server Components/Actions), cookie-baseret.
  - `lib/supabase/middleware.ts` + `middleware.ts` – opdaterer sessionen på hver request og sender uautoriserede til `/login`. Allerede loggede ind brugere på `/login` sendes til `/denne-uge`.
  - Selvtilmelding er slået fra i Supabase-dashboardet (ikke i kode) – kun de to manuelt oprettede konti kan logge ind.
- **Routing**: `(app)`-route-gruppe med fælles layout (`app/(app)/layout.tsx`) der viser bundmenuen og en "Log ud"-knap. De fem bundmenu-sider er stubs, der bygges ud i senere faser:
  - `/denne-uge`, `/planlaeg-uge`, `/tilbud`, `/beholdning`, `/indkoebsliste`.
  - "Opskrifter" og "Indstillinger" (de to resterende skærme fra SPEC.md) er endnu ikke linket noget sted – tilføjes i de faser, hvor de giver mening.
- **PWA**: `app/manifest.ts` + ikoner genereret med `next/og`'s `ImageResponse` (`app/icon.tsx`, `app/apple-icon.tsx`, `app/icons/icon-192`, `app/icons/icon-512`) – ingen eksterne billedfiler eller nyt afhængighed. Ingen service worker/offline-cache (ikke krævet).
- **Validering**: `zod` er installeret og bruges allerede i login-formularen (`app/login/actions.ts`).
- **xlsx**: installeret fra SheetJS' egen CDN (`https://cdn.sheetjs.com/...`), ikke npm-registry-versionen - npm-udgaven har en uprettet høj-alvorlig sårbarhed. ESM-byggets `XLSX.readFile(sti)` fejler desuden på denne maskine, fordi projektstien indeholder "ø" - scripts læser derfor filen selv med `fs.readFileSync` og giver XLSX en buffer (`XLSX.read(buffer, { type: "buffer" })`).

## Miljøvariabler

Se `.env.example`. Reelle værdier ligger i `.env.local` (ikke i git) og skal også sættes i Vercels projektindstillinger:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CLAUDE_MODEL_PLANNER   (standard: claude-sonnet-5-5)
CLAUDE_MODEL_FAST      (standard: claude-haiku-5-5)
```

## Kør appen lokalt

```bash
npm install
npm run dev
```

Åbn `http://localhost:3000`. Uden login sendes du til `/login`. Log ind med en af de to konti, der er oprettet manuelt i Supabase-dashboardet (Authentication → Users).

## Ting, der kun kan gøres uden for Claude Code

- Oprette/ændre Supabase-brugere og -indstillinger (selvtilmelding er slået fra manuelt).
- Oprette GitHub-repo og importere det i Vercel + sætte miljøvariabler der.
- Hente eller indtaste rigtige nøgler/adgangskoder.
