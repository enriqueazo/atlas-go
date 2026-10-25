// Builds src/data/world.json: a cartoon-smoothed, text-free world map with
// game metadata, from Natural Earth (public domain, naturalearthdata.com).
//
//   node scripts/build-map.mjs
//
// Downloads go to scripts/.cache (gitignored).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoPath } from 'd3-geo';
import { geoPatterson, geoProject } from 'd3-geo-projection';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile, planarTriangleArea } from 'topojson-simplify';
import { feature, neighbors } from 'topojson-client';

import { CAPITALS, NAME_EN, NAME_ES } from './capitals.mjs';
import { chaikin, dedupe, fiveColors, load, zoomBox } from './map-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'src', 'data', 'world.json');

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

const geoms = topo.objects.land.geometries;
const fc = feature(topo, topo.objects.land);
const path = geoPath().digits(1);

// Five map colours so no two neighbours share one.
const color = fiveColors(neighbors(geoms));

const capitalIndex = new Map();
for (const f of places.features) {
  const p = f.properties;
  if (!/capital/i.test(p.featurecla ?? '')) continue;
  capitalIndex.set(`${p.iso_a2}|${p.name}`, f.geometry.coordinates);
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

  const { main, box: [bx0, by0, bx1, by1] } = zoomBox(f, path);
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
