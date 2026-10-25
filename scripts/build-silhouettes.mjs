// Builds src/data/silhouettes.json: each playable country's outline on its
// own, for the Silhouette mode, from Natural Earth 10m (public domain).
//
//   node scripts/build-silhouettes.mjs
//
// The world map is too coarse for this (Luxembourg is a triangle there) and
// its projection stretches the far north, so each country gets its own
// equal-area projection centred on it, fitted to a SIZE × SIZE square.
// Downloads go to scripts/.cache (gitignored).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoAzimuthalEqualArea, geoCentroid, geoPath } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { feature } from 'topojson-client';

import { chaikin, dedupe, load, zoomBox } from './map-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'src', 'data', 'silhouettes.json');
const world = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'world.json'), 'utf8'));

const SIZE = 100;
const PAD = 4;
// Islands smaller than this share of the main part are dropped.
const MIN_PART = 0.002;
// Simplification in square units of the SIZE box: coasts stay recognisable
// and the file stays near 300 KB.
const MIN_WEIGHT = 1;

// Specks and scattered islands whose outline tells nothing stay out of the
// mode.
const SKIP = new Set('BS VU FJ VA MC NR TV MV MH KI PW FM SM SG BH MT TO WS ST SC KN AG GD VC LC DM BB MU KM CV'.split(' '));

const countries = await load('ne_10m_admin_0_countries.geojson');
const byIso = new Map();
for (const f of countries.features) {
  const p = f.properties;
  if (p.TYPE === 'Dependency' || p.TYPE === 'Lease') continue;
  // Northern Cyprus and Somaliland have no ISO code; they stay off.
  if (!byIso.has(p.ISO_A2_EH)) byIso.set(p.ISO_A2_EH, f);
}

const polygons = (g) =>
  g.type === 'MultiPolygon' ? g.coordinates.map((c) => ({ type: 'Polygon', coordinates: c })) : [g];

const shapes = {};
for (const c of world.countries) {
  if (SKIP.has(c.iso)) continue;
  const f = byIso.get(c.iso);
  if (!f) {
    console.warn(`${c.iso}: not in Natural Earth 10m`);
    continue;
  }
  // Centre on the largest part, so far-off islands don't pull the view.
  const parts = polygons(f.geometry);
  const sphere = geoPath();
  const main = parts.reduce((a, b) => (sphere.area(b) > sphere.area(a) ? b : a));
  const [lon, lat] = geoCentroid(main);
  const projection = geoAzimuthalEqualArea().rotate([-lon, -lat]).precision(0.05);
  projection.fitExtent([[0, 0], [1000, 1000]], main);
  const flat = geoProject({ type: 'Feature', properties: {}, geometry: f.geometry }, projection);

  // The main part and the islands close to it, as on the world map's zoom.
  const path = geoPath();
  const { main: big, box } = zoomBox(flat, path);
  const keep = polygons(flat.geometry).filter((g) => {
    const [[x0, y0], [x1, y1]] = path.bounds(g);
    return x0 >= box[0] - 1 && y0 >= box[1] - 1 && x1 <= box[2] + 1 && y1 <= box[3] + 1 && path.area(g) >= big.a * MIN_PART;
  });
  const shape = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: keep.map((g) => g.coordinates) } };

  // Fit the kept parts to the square, then simplify and round the corners.
  const [[x0, y0], [x1, y1]] = path.bounds(shape);
  const k = (SIZE - 2 * PAD) / Math.max(x1 - x0, y1 - y0);
  const dx = (SIZE - k * (x1 - x0)) / 2 - k * x0;
  const dy = (SIZE - k * (y1 - y0)) / 2 - k * y0;
  const fitted = {
    ...shape,
    geometry: {
      type: 'MultiPolygon',
      coordinates: shape.geometry.coordinates.map((poly) =>
        poly.map((ring) => ring.map(([x, y]) => [k * x + dx, k * y + dy])),
      ),
    },
  };
  let topo = presimplify(topology({ s: fitted }));
  topo = simplify(topo, MIN_WEIGHT);
  topo.arcs = topo.arcs.map((arc) => chaikin(arc));
  shapes[c.iso] = dedupe(geoPath().digits(1)(feature(topo, topo.objects.s)));
}

writeFileSync(out, JSON.stringify({ size: SIZE, shapes }));
console.log(`${Object.keys(shapes).length} silhouettes → ${out} (${(JSON.stringify(shapes).length / 1024).toFixed(0)} KB)`);
