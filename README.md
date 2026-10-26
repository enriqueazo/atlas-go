# Atlas Go

A geography quiz for phones. A cartoon world map with no words on it zooms to a
country and you pick its name, or to a capital and you pick which city it is.
Points climb with every right answer, a miss sends them back to 0, and your
record stays. Spanish and English.

## Modes

- **Países / Countries**: a country lights up on the map; pick its name from three.
- **Capitales / Capitals**: a dot marks a capital; pick which city it is from three.
- **Completa el mapa / Complete the map**: the game names a country and you tap
  it to paint it. The clock runs, each wrong tap adds 5 s, and the fastest whole
  world is the record.
- **Completa un país / Complete a country**: the same, on one country's map of
  provinces, states or regions. Each country keeps its own record.

Every 5 right answers in a row opens a harder level (1 to 5). Level 1 is the
countries almost everyone can place; level 5 adds microstates and small island
nations, which get a ring around them so you can find them. Harder countries are
worth more points (10 × level), and from level 3 the wrong options come from the
same region.

The 193 UN members plus Vatican City and Palestine are playable. Capitals mode
skips Israel, Palestine and Nauru, which have no single undisputed capital.

## Run it

```bash
npm install
npx expo start        # then press i, a or w
```

## Build with EAS

`eas.json` has three profiles: `development` (dev client, internal), `preview` (internal install, Android APK) and `production` (store builds, build number bumped by EAS). `preview` and `production` talk to the prod Supabase project; `development` uses dev.

The app is linked to the EAS project `atlas-go` on the `enriqueazos-team` account (`owner` and `extra.eas.projectId` in `app.json`). Builds can be started from the CLI (`npx eas-cli@latest build --profile preview`) or from the project's page on expo.dev; pick a branch that has `eas.json`.

## Project layout

- `src/app/(tabs)/`: the tab screens: `index.tsx` lobby and game, `ranking.tsx`, `settings.tsx`.
- `src/components/WorldMap.tsx`: the SVG map and its camera (zoom and fly between countries).
- `src/game/engine.ts`: question picking, levels and points.
- `src/theme.tsx`, `src/components/ui.tsx`, `src/components/OptionCard.tsx`: ported from Vocablo (`enriqueazo/e-e`), plus the map colours. Styles follow Vocablo's `themed((colors) => ({ colors, styles }))` pattern.
- `src/i18n.ts`: every user-visible string in Spanish and English.
- `src/game/complete.ts`, `src/game/useCompleteGame.ts`: Complete the map, on any `Board` (the world or a country).
- `src/game/countries.ts`: the countries you can complete, loaded only when played.
- `src/data/world.json`, `src/data/regions/*.json`: generated map data; don't edit by hand.
- `src/cloud/`: Supabase: the client, the projects (`config.ts`), the account (`account.ts`), ranked games, leagues and groups (`ranked.ts`) and duels (`duels.ts`). `src/app/ranked.tsx` and `src/components/RankedGame.tsx`: the Ranked screen; `src/components/OnlineRanking.tsx`: the league and standings in the Ranking tab. `src/app/duels/`, `src/app/play-duel.tsx`, `src/app/duel/[code].tsx`: the duel screens. `supabase/migrations/`: the database tables and security rules.

## Map data

The map comes from [Natural Earth](https://www.naturalearthdata.com/) (public
domain), 1:50m countries and 1:10m populated places. To rebuild it:

```bash
node scripts/build-map.mjs
```

The script projects the outlines (Natural Earth projection), simplifies them on
shared borders, rounds the corners for the cartoon look, drops Antarctica, picks
five map colours so neighbours never match, and works out each country's zoom
frame and difficulty tier. Capital names in both languages live in
`scripts/capitals.mjs`.

Each country's map comes from Natural Earth's 1:10m states and provinces:

```bash
node scripts/build-regions.mjs        # all of them
node scripts/build-regions.mjs ES     # one
```

The countries and how their provinces become regions (Spain's comunidades,
Italy's and France's regions, the Canaries and Alaska moved into insets) are
listed at the top of the script. Neighbouring countries are drawn as blank
land around the map. Bigger regions come first, the smallest last.

## Online play (Supabase)

Online play follows Vocablo's setup (`enriqueazo/e-e`). Every player gets a
free account automatically (Supabase anonymous sign-in) the first time they go
online, with a profile other players see: a name and a country. The phone stays
the main copy of everything else, and the game never waits for the network.

Until a Supabase project is set up, `src/cloud/config.ts` is empty and the app
plays offline: the Account card in Settings says online play isn't on yet.

### Setting it up

1. Create two projects at [supabase.com](https://supabase.com/dashboard):
   `atlas-go-dev` and `atlas-go-prod` (the free plan is enough).
2. In each one, turn on anonymous sign-ins: Authentication › Sign In /
   Providers › "Allow anonymous sign-ins".
3. Copy each project's URL and **publishable** key (Project Settings › API
   Keys) into `src/cloud/config.ts`. The publishable key is meant to ship in
   the app; never put the secret key there.
4. Push the database to both projects:

   ```bash
   npx supabase login
   npx supabase link --project-ref <dev project ref>    # asks for its database password
   npx supabase db push
   npx supabase link --project-ref <prod project ref>
   npx supabase db push
   ```

`npx expo start` and development builds use dev; tester and store builds
(`eas.json` "preview" and "production") set `EXPO_PUBLIC_SUPABASE_ENV=prod`.
The database changes live in `supabase/migrations/`.

### Ranked and weekly leagues

**Clasificatoria / Ranked** is 10 questions of 30 seconds that take turns
through Countries, Flags, Silhouettes and Capitals. The server runs the game
(`supabase/migrations/*_ranked_and_leagues.sql`): it picks each question near
the player's level (up one level per right answer, down one per miss), times
it, and scores it at 10 × the place's tier. The app only draws the question.
Points go to the weekly league: about 30 players of the same tier
(Explorer › Navigator › Cartographer › Geographer › Atlas), where each Monday
the top 7 go up and the bottom 5 go down. The Ranking tab shows the league,
the standings (world, your country, or an invite-code group) and the groups.

The app draws each question itself, so it does know the answer: the server
stops made-up scores, easy picks and slow answers, not a player reading the
app's memory. That's the same trade-off Vocablo makes.

The server keeps the list of places it can ask about. **Whenever
`world.json`, the silhouettes or the flags change**, regenerate it and push the
new migration, or ranked games will refuse to start ("there's a new version"):

```bash
node scripts/build-ranked-places.mjs
npx supabase db push
```

### Duels

**Duelos / Duels** are asynchronous, as in Vocablo
(`supabase/migrations/*_duels.sql`). Both players get the same 10 questions
(the same places and options, from level 1 to 5) and each plays whenever they
can within 48 hours. Whoever gets more right wins; ties go to more points,
then less total time, and the winner's points count for their league. A duel
starts by challenging a player by name, sharing a link
(`atlasgo://duel/CODE`) or its code, or asking for a random rival. Each
player's game is a server-run Ranked game, so the same rules apply.

## Sounds

Synthesised from sine waves like Vocablo's (no third-party audio):

```bash
python3 scripts/make_sounds.py
```
