// Builds src/data/world.json: a cartoon-smoothed, text-free world map with
// game metadata, from Natural Earth (public domain, naturalearthdata.com).
//
//   node scripts/build-map.mjs
//
// Downloads go to scripts/.cache (gitignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoPath } from 'd3-geo';
import { geoPatterson, geoProject } from 'd3-geo-projection';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile, planarTriangleArea } from 'topojson-simplify';
import { feature, neighbors } from 'topojson-client';

import { CAPITALS, NAME_EN, NAME_ES } from './capitals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, '.cache');
const out = join(here, '..', 'src', 'data', 'world.json');
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';

async function load(name) {
  mkdirSync(cache, { recursive: true });
  const file = join(cache, name);
  if (!existsSync(file)) {
    const res = await fetch(NE + name);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

// UN members plus the two observer states.
const PLAYABLE = new Set(
  ('AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL ' +
    'CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN ' +
    'GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY ' +
    'MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT ' +
    'QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO ' +
    'TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW VA PS').split(' '),
);

// Tier 1: the countries almost everyone can place.
const FAMOUS = new Set(
  'US CA MX BR AR RU CN IN AU FR ES IT DE GB JP EG ZA PT GR TR SA CL CO PE'.split(' '),
);

// Island nations that are hard to place even when not tiny.
const SMALL_ISLANDS = new Set(
  'AG BS BB BH CV KM DM FJ GD KI MV MT MH MU FM NR PW KN LC VC WS ST SC SB TO TT TV VU SG BN TL JM CY'.split(' '),
);

const WIDTH = 1000;

const [countries, places] = await Promise.all([
  load('ne_50m_admin_0_countries.geojson'),
  load('ne_10m_populated_places_simple.geojson'),
]);

const features = countries.features.filter((f) => f.properties.CONTINENT !== 'Antarctica');
for (const f of features) {
  const p = f.properties;
  const iso = p.ISO_A2_EH;
  f.properties = {
    iso: PLAYABLE.has(iso) && p.TYPE !== 'Dependency' ? iso : null,
    p,
  };
}

// Project first, so simplification works on the flat map we draw. Patterson
// is cylindrical: the left and right edges are both the 180th meridian and
// the top and bottom are straight, so the map tiles seamlessly when the game
// wraps it like a torus. WIDTH is exactly 360 degrees of longitude.
const PAD = 12;
const projection = geoPatterson()
  .scale(WIDTH / (2 * Math.PI))
  .translate([WIDTH / 2, 0])
  .precision(0.1);
{
  const [[, top], [, bottom]] = geoPath(projection).bounds({ type: 'FeatureCollection', features });
  projection.translate([WIDTH / 2, -top + PAD]);
  var HEIGHT = Math.ceil(bottom - top + 2 * PAD);
}
const flat = geoProject({ type: 'FeatureCollection', features }, projection);

// Drop specks: islands under MIN_ISLAND square units, except a country's
// largest piece, so microstates and atolls stay on the map.
const MIN_ISLAND = 1.5;
const flatPath = geoPath();
for (const f of flat.features) {
  if (f.geometry?.type !== 'MultiPolygon') continue;
  const polys = f.geometry.coordinates.map((c) => ({ c, a: flatPath.area({ type: 'Polygon', coordinates: c }) }));
  const max = Math.max(...polys.map((x) => x.a));
  f.geometry.coordinates = polys.filter((x) => x.a >= MIN_ISLAND || x.a === max).map((x) => x.c);
}

// Simplify on shared arcs so neighbours keep matching borders, then round the
// corners (Chaikin) on the same arcs for the soft cartoon outline.
let topo = topology({ land: flat });
topo = presimplify(topo, planarTriangleArea);
topo = simplify(topo, quantile(topo, 0.06));
topo.arcs = topo.arcs.map((arc) => chaikin(chaikin(arc)));

function chaikin(arc) {
  if (arc.length < 3) return arc;
  const res = [arc[0]];
  for (let i = 0; i < arc.length - 1; i++) {
    const [x0, y0] = arc[i];
    const [x1, y1] = arc[i + 1];
    if (i > 0) res.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
    if (i < arc.length - 2) res.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
  }
  res.push(arc[arc.length - 1]);
  return res;
}

const geoms = topo.objects.land.geometries;
const fc = feature(topo, topo.objects.land);
const path = geoPath().digits(1);

// Five map colours so no two neighbours share one.
const adj = neighbors(geoms);
const color = new Array(geoms.length).fill(-1);
const order = [...geoms.keys()].sort((a, b) => adj[b].length - adj[a].length);
for (const i of order) {
  const used = new Set(adj[i].map((j) => color[j]));
  let c = (i * 7) % 5;
  for (let k = 0; k < 5 && used.has(c); k++) c = (c + 1) % 5;
  color[i] = c;
}

const capitalIndex = new Map();
for (const f of places.features) {
  const p = f.properties;
  if (!/capital/i.test(p.featurecla ?? '')) continue;
  capitalIndex.set(`${p.iso_a2}|${p.name}`, f.geometry.coordinates);
}

// Rounding to one decimal leaves runs of repeated points; drop them.
function dedupe(d) {
  if (!d) return d;
  return d
    .split('M')
    .filter(Boolean)
    .map((ring) => {
      const pts = ring.replace(/Z$/, '').split('L');
      const kept = pts.filter((pt, i) => i === 0 || pt !== pts[i - 1]);
      return 'M' + (kept.length > 2 ? kept : pts).join('L') + 'Z';
    })
    .join('') || null;
}

const r = (n) => Math.round(n * 10) / 10;
const land = [];
const playable = [];
fc.features.forEach((f, i) => {
  const d = dedupe(path(f));
  if (!d) return;
  const { iso, p } = f.properties;
  land.push({ iso, d, c: color[i] });
  if (!iso) return;

  // Zoom box: the largest polygon plus nearby parts (drops far-off overseas
  // territories such as French Guiana from France's frame).
  const polys =
    f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
      : [f.geometry];
  const parts = polys
    .map((g) => ({ g, a: path.area(g), b: path.bounds(g) }))
    .filter((x) => Number.isFinite(x.b[0][0]))
    .sort((a, b) => b.a - a.a);
  const main = parts[0];
  const diag = Math.hypot(main.b[1][0] - main.b[0][0], main.b[1][1] - main.b[0][1]);
  const gap = Math.max(30, diag * 0.3);
  let [bx0, by0, bx1, by1] = [main.b[0][0], main.b[0][1], main.b[1][0], main.b[1][1]];
  // Grow the box with any part close to it, so island chains stay together
  // while far-off pieces (Chukotka across the date line) stay out.
  const rest = parts.slice(1);
  for (let grew = true; grew; ) {
    grew = false;
    for (let k = rest.length - 1; k >= 0; k--) {
      const [[x0, y0], [x1, y1]] = rest[k].b;
      const dx = Math.max(bx0 - x1, x0 - bx1, 0);
      const dy = Math.max(by0 - y1, y0 - by1, 0);
      if (Math.hypot(dx, dy) > gap) continue;
      [bx0, by0, bx1, by1] = [Math.min(bx0, x0), Math.min(by0, y0), Math.max(bx1, x1), Math.max(by1, y1)];
      rest.splice(k, 1);
      grew = true;
    }
  }
  const center = path.centroid(main.g);
  const size = Math.max(bx1 - bx0, by1 - by0);
  const area = path.area(f);
  const tiny = size < 7;

  // Tiers 1-4 by how well known a country is; tier 5 is kept for
  // microstates and small island nations.
  let tier;
  if (FAMOUS.has(iso)) tier = 1;
  else if (p.LABELRANK <= 3) tier = 2;
  else if (p.LABELRANK <= 4) tier = 3;
  else tier = 4;
  if (size < 5 || SMALL_ISLANDS.has(iso)) tier = 5;
  else if (tiny) tier = Math.max(tier, 4);

  let capital = null;
  const cap = CAPITALS[iso];
  if (cap) {
    const [en, es, neName, lonLat] = cap;
    const ll = lonLat ?? capitalIndex.get(`${iso}|${neName ?? en}`);
    if (!ll) throw new Error(`No coordinates for capital of ${iso}: ${en}`);
    const [x, y] = projection(ll);
    capital = { en, es, x: r(x), y: r(y) };
  }

  playable.push({
    iso,
    en: NAME_EN[iso] ?? p.NAME_EN,
    es: NAME_ES[iso] ?? p.NAME_ES,
    continent: p.CONTINENT,
    region: p.SUBREGION,
    tier,
    tiny,
    center: [r(center[0]), r(center[1])],
    box: [r(bx0), r(by0), r(bx1 - bx0), r(by1 - by0)],
    capital,
  });
});

playable.sort((a, b) => a.iso.localeCompare(b.iso));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ width: WIDTH, height: HEIGHT, land, countries: playable }));

const tiers = [1, 2, 3, 4, 5].map((t) => playable.filter((c) => c.tier === t).length);
console.log(`${land.length} shapes, ${playable.length} playable, tiers ${tiers.join('/')}`);
console.log(`${(readFileSync(out).length / 1024).toFixed(0)} KB, ${WIDTH}x${HEIGHT}`);
