# Madplan-appen – CLAUDE.md

Se `SPEC.md` for den fulde specifikation. Denne fil holder styr på beslutninger og hvordan appen køres, så en ny session kan fortsætte.

## Status

- **Fase 0 (Opsætning): færdig og testet.** Next.js-skelet, Supabase-login, tom bundmenu, PWA-manifest. Login bekræftet fra telefon via Vercel-adressen `madplan-app-weld.vercel.app`.
  - Husk: Vercel-projektets Framework Preset skal stå på "Next.js" (ingen build/output-overrides) – blev rettet manuelt efter første deploy.
- **Fase 1 (Grunddata): færdig og testet.** Alle 15 tabeller migreret, Indstillinger (personer, butikker, måltidsgitter, måltidsandele, budget m.m.), Beholdning med AI-tolket hurtig tilføjelse, basisvare-checkliste og seed-data (2 personer, lille beholdning, eksempeltilbud, ~90 estimerede priser). Bekræftet i produktion: fritekst → beholdning, og indstillinger gemmer.
  - Faldgrube at huske: filer med `"use server"` må kun eksportere async-funktioner. Konstanter (DAYS, MEAL_TYPES) lå først i `indstillinger/actions.ts` og gav en ødelagt reference i produktion (men ikke lokalt/i build) – flyttet til egen `constants.ts`. Tjek for dette mønster, hvis en ny "virker lokalt, fejler i prod"-fejl dukker op i en `actions.ts`-fil.
- Fase 2–6: ikke startet, se `SPEC.md` → "Byggeplan i faser".

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
