// Builds src/data/neighbours.json: for each playable country, the playable
// countries it shares a land border with, for the Neighbours mode, from
// Natural Earth 10m (public domain).
//
//   node scripts/build-neighbours.mjs
//
// Only borders the player can see when the game zooms to a country count:
// pieces far from a country's main land (French Guiana for France, Alaska
// for the US) are left out, with the same rule as the world map's zoom box.
// Places outside the game (Western Sahara, Kosovo, dependencies) are gaps.
// Downloads go to scripts/.cache (gitignored).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoPath } from 'd3-geo';
import { geoPatterson } from 'd3-geo-projection';
import { topology } from 'topojson-server';
import { neighbors } from 'topojson-client';

import { load, zoomBox } from './map-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'src', 'data', 'neighbours.json');
const world = JSON.parse(readFileSync(join(root, 'src', 'data', 'world.json'), 'utf8'));
const playable = new Set(world.countries.map((c) => c.iso));

const countries = await load('ne_10m_admin_0_countries.geojson');
const path = geoPath(geoPatterson());

// One geometry per polygon, so far-off pieces can be told apart.
const pieces = [];
for (const f of countries.features) {
  const p = f.properties;
  const iso = p.TYPE === 'Dependency' || p.TYPE === 'Lease' ? null : p.ISO_A2_EH;
  if (!playable.has(iso)) continue;
  const { box } = zoomBox(f, path);
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const coordinates of polys) {
    const g = { type: 'Polygon', coordinates };
    const [[x0, y0], [x1, y1]] = path.bounds(g);
    const near = x0 >= box[0] - 1 && y0 >= box[1] - 1 && x1 <= box[2] + 1 && y1 <= box[3] + 1;
    pieces.push({ type: 'Feature', properties: { iso, near }, geometry: g });
  }
}

// Shared arcs make neighbours; quantizing snaps borders that almost meet.
const topo = topology({ pieces: { type: 'FeatureCollection', features: pieces } }, 1e6);
const adjacent = neighbors(topo.objects.pieces.geometries);
const result = Object.fromEntries([...playable].map((iso) => [iso, new Set()]));
adjacent.forEach((list, i) => {
  const a = pieces[i].properties;
  if (!a.near) return;
  for (const j of list) {
    const b = pieces[j].properties;
    if (b.near && a.iso !== b.iso) {
      result[a.iso].add(b.iso);
      result[b.iso].add(a.iso);
    }
  }
});

const sorted = Object.fromEntries(
  Object.entries(result)
    .filter(([, s]) => s.size > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, s]) => [iso, [...s].sort()]),
);
writeFileSync(out, JSON.stringify(sorted, null, 0));
console.log(`${Object.keys(sorted).length} countries with land neighbours → ${out}`);
