# Atlas Go

A geography quiz for phones. A cartoon world map with no words on it zooms to a
country and you pick its name, or to a capital and you pick which city it is.
Points climb with every right answer, a miss sends them back to 0, and your
record stays. Spanish and English.

## Modes

- **Países / Countries**: a country lights up on the map; pick its name from three.
- **Capitales / Capitals**: a dot marks a capital; pick which city it is from three.

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

## Project layout

- `src/app/`: screens (Expo Router tabs): `index.tsx` game and lobby, `ranking.tsx`, `settings.tsx`.
- `src/components/WorldMap.tsx`: the SVG map and its camera (zoom and fly between countries).
- `src/game/engine.ts`: question picking, levels and points.
- `src/theme.tsx`: the Vocablo design tokens (both themes), type scale and `themed()` styles.
- `src/i18n.ts`: every user-visible string in Spanish and English.
- `src/data/world.json`: generated map and country data; don't edit by hand.

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

## Sounds

Synthesised from sine waves like Vocablo's (no third-party audio):

```bash
python3 scripts/make_sounds.py
```
