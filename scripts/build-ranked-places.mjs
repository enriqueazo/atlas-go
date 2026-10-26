// Writes the list of places ranked games and duels can ask about, for the
// server, from the game's own data: a migration that loads it into
// public.quiz_places, and src/data/ranked.ts with its version. The app sends
// that version when a ranked game starts, so an app with other data can't
// play ranked until it's updated.
//
//   node scripts/build-ranked-places.mjs
//
// Run it whenever world.json, the silhouettes or the flags change, then push
// the new migration (npx supabase db push).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const world = JSON.parse(readFileSync(join(root, 'src', 'data', 'world.json'), 'utf8'));
const silhouettes = JSON.parse(readFileSync(join(root, 'src', 'data', 'silhouettes.json'), 'utf8')).shapes;
const flags = new Set(readdirSync(join(root, 'assets', 'flags')).map((f) => f.replace('.webp', '').toUpperCase()));

const rows = world.countries
  .map((c) => ({
    iso: c.iso,
    tier: c.tier,
    region: c.region,
    continent: c.continent,
    capital: !!c.capital,
    flag: flags.has(c.iso),
    silhouette: !!silhouettes[c.iso],
  }))
  .sort((a, b) => a.iso.localeCompare(b.iso));
const version = createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 10);

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const values = rows
  .map((r) => `  (${q(r.iso)}, ${r.tier}, ${q(r.region)}, ${q(r.continent)}, ${r.capital}, ${r.flag}, ${r.silhouette})`)
  .join(',\n');
const sql = `-- Made by scripts/build-ranked-places.mjs; don't edit by hand.
-- The places ranked games and duels ask about (${rows.length}), version ${version}.

delete from public.quiz_places;
insert into public.quiz_places (iso, tier, region, continent, capital, flag, silhouette) values
${values};
update public.ranked_config set data = ${q(version)};
`;
writeFileSync(join(root, 'supabase', 'migrations', '20261025130100_ranked_places.sql'), sql);
writeFileSync(
  join(root, 'src', 'data', 'ranked.ts'),
  `// Made by scripts/build-ranked-places.mjs; don't edit by hand.\n/** The version of the places the server asks about in ranked games; must match ranked_config on the server. */\nexport const RANKED_DATA = '${version}';\n`,
);
console.log(`${rows.length} places, version ${version}`);
