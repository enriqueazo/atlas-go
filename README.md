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

`eas.json` has three profiles: `development` (dev client, internal), `preview` (internal install, Android APK) and `production` (store builds, build number bumped by EAS).

The first time, link the project to your Expo account so `app.json` gets its `extra.eas.projectId`:

```bash
npx eas-cli@latest init
```

Commit that change. After that, builds can be started from the CLI (`npx eas-cli@latest build --profile preview`) or from the project's page on expo.dev, including GitHub-triggered builds once the repo is linked there.

## Project layout

- `src/app/(tabs)/`: the tab screens: `index.tsx` lobby and game, `ranking.tsx`, `settings.tsx`.
- `src/components/WorldMap.tsx`: the SVG map and its camera (zoom and fly between countries).
- `src/game/engine.ts`: question picking, levels and points.
- `src/theme.tsx`, `src/components/ui.tsx`, `src/components/OptionCard.tsx`: ported from Vocablo (`enriqueazo/e-e`), plus the map colours. Styles follow Vocablo's `themed((colors) => ({ colors, styles }))` pattern.
- `src/i18n.ts`: every user-visible string in Spanish and English.
- `src/game/complete.ts`, `src/game/useCompleteGame.ts`: Complete the map, on any `Board` (the world or a country).
- `src/game/countries.ts`: the countries you can complete, loaded only when played.
- `src/data/world.json`, `src/data/regions/*.json`: generated map data; don't edit by hand.

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

## Sounds

Synthesised from sine waves like Vocablo's (no third-party audio):

```bash
python3 scripts/make_sounds.py
```
