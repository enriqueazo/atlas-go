// Builds src/data/regions/<CC>.json: one country's provinces, states or
// regions as a cartoon map to fill in, with its neighbours around it as
// blank land, from Natural Earth admin-1 (public domain).
//
//   node scripts/build-regions.mjs        # every country below
//   node scripts/build-regions.mjs ES MX  # just these
//
// Downloads go to scripts/.cache (gitignored). The world map's look (shared
// borders simplified together, Chaikin-rounded corners, five colours) comes
// from map-utils.mjs.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoAlbers, geoAlbersUsa, geoBounds, geoCentroid, geoConicConformal, geoPath } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import { topology } from 'topojson-server';
import { presimplify, planarTriangleArea } from 'topojson-simplify';
import { feature, mergeArcs, neighbors } from 'topojson-client';

import { chaikin, dedupe, fiveColors, load, zoomBox } from './map-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'src', 'data', 'regions');

/** Region id from the province's ISO 3166-2 code ("MX-JAL"). */
const iso = (p) => p.iso_3166_2.trim();
/** Region id from the bigger region a province belongs to ("IT-25"). */
const group = (p) => p.region_cod.trim().replace('.', '-');

// The countries on offer, picked for having enough regions that people know
// (13 to 50) and borders nobody disputes. Each says how its Natural Earth
// provinces become the game's regions:
// - region(p): the region id, or null to leave it out (drawn as blank land)
// - names: [es, en] by region id; otherwise Natural Earth's names, `local`
//   meaning the name in the country's own language for that side
// - keep(lon, lat): drops far-off islands, by where each piece lies
// - move(lon, lat): moves pieces, for an inset (the Canaries)
// - insets: regions drawn in their own frame
// - around: the only neighbours to draw, by Natural Earth's adm0_a3
const COUNTRIES = {
  ES: {
    region: (p) => (p.region === 'Melilla' ? 'ES-ML' : group(p)),
    names: {
      'ES-AN': ['Andalucía', 'Andalusia'],
      'ES-AR': ['Aragón', 'Aragon'],
      'ES-AS': ['Asturias', 'Asturias'],
      'ES-CN': ['Canarias', 'Canary Islands'],
      'ES-CB': ['Cantabria', 'Cantabria'],
      'ES-CL': ['Castilla y León', 'Castile and León'],
      'ES-CM': ['Castilla-La Mancha', 'Castilla–La Mancha'],
      'ES-CT': ['Cataluña', 'Catalonia'],
      'ES-CE': ['Ceuta', 'Ceuta'],
      'ES-ML': ['Melilla', 'Melilla'],
      'ES-EX': ['Extremadura', 'Extremadura'],
      'ES-NA': ['Navarra', 'Navarre'],
      'ES-GA': ['Galicia', 'Galicia'],
      'ES-PM': ['Islas Baleares', 'Balearic Islands'],
      'ES-LO': ['La Rioja', 'La Rioja'],
      'ES-MD': ['Comunidad de Madrid', 'Community of Madrid'],
      'ES-MU': ['Región de Murcia', 'Murcia'],
      'ES-PV': ['País Vasco', 'Basque Country'],
      'ES-VC': ['Comunidad Valenciana', 'Valencian Community'],
    },
    // The Canaries move up next to the peninsula, in a frame, as on Spanish maps.
    move: (lon, lat) => (lat < 30 ? [lon + 5, lat + 6] : [lon, lat]),
    insets: ['ES-CN'],
  },
  MX: {
    region: (p) => (p.name ? iso(p) : null),
    local: 'es',
    names: {
      'MX-DIF': ['Ciudad de México', 'Mexico City'],
      'MX-MEX': ['Estado de México', 'State of Mexico'],
    },
  },
  AR: { region: iso, local: 'es', names: { 'AR-C': ['Ciudad de Buenos Aires', 'Buenos Aires City'] } },
  CO: {
    region: (p) => (!p.name ? null : p.name === 'Bogota' ? 'CO-DC' : iso(p)),
    local: 'es',
    names: {
      'CO-DC': ['Bogotá', 'Bogotá'],
      'CO-SAP': ['San Andrés y Providencia', 'San Andrés and Providencia'],
    },
  },
  CL: { region: iso, local: 'es', keep: (lon) => lon > -80 },
  // Lima Province and the Lima Region share a code; they play as one.
  PE: { region: iso, local: 'es' },
  BR: { region: iso, local: 'en', keep: (lon) => lon < -33 },
  US: {
    region: (p) => (p.iso_3166_2 === 'US-DC' ? null : iso(p)),
    local: 'en',
    insets: ['US-AK', 'US-HI'],
    // Only Canada around it: Mexico would run under the Alaska and Hawaii insets.
    around: ['CAN'],
  },
  CA: { region: iso, names: { 'CA-QC': ['Quebec', 'Quebec'] } },
  DE: { region: iso },
  FR: {
    region: (p) => (p.type_en === 'Metropolitan department' ? group(p) : null),
    names: {
      'FR-ARA': ['Auvernia-Ródano-Alpes', 'Auvergne-Rhône-Alpes'],
      'FR-BFC': ['Borgoña-Franco Condado', 'Bourgogne-Franche-Comté'],
      'FR-BRE': ['Bretaña', 'Brittany'],
      'FR-CVL': ['Centro-Valle de Loira', 'Centre-Val de Loire'],
      'FR-COR': ['Córcega', 'Corsica'],
      'FR-GES': ['Gran Este', 'Grand Est'],
      'FR-HDF': ['Altos de Francia', 'Hauts-de-France'],
      'FR-IDF': ['Isla de Francia', 'Île-de-France'],
      'FR-NOR': ['Normandía', 'Normandy'],
      'FR-NAQ': ['Nueva Aquitania', 'Nouvelle-Aquitaine'],
      'FR-OCC': ['Occitania', 'Occitanie'],
      'FR-PDL': ['País del Loira', 'Pays de la Loire'],
      'FR-PAC': ['Provenza-Alpes-Costa Azul', 'Provence-Alpes-Côte d’Azur'],
    },
  },
  IT: {
    region: group,
    names: {
      'IT-23': ['Valle de Aosta', 'Aosta Valley'],
      'IT-65': ['Abruzos', 'Abruzzo'],
      'IT-75': ['Apulia', 'Apulia'],
      'IT-77': ['Basilicata', 'Basilicata'],
      'IT-78': ['Calabria', 'Calabria'],
      'IT-72': ['Campania', 'Campania'],
      'IT-45': ['Emilia-Romaña', 'Emilia-Romagna'],
      'IT-36': ['Friul-Venecia Julia', 'Friuli Venezia Giulia'],
      'IT-62': ['Lacio', 'Lazio'],
      'IT-42': ['Liguria', 'Liguria'],
      'IT-25': ['Lombardía', 'Lombardy'],
      'IT-57': ['Marcas', 'Marche'],
      'IT-67': ['Molise', 'Molise'],
      'IT-21': ['Piamonte', 'Piedmont'],
      'IT-88': ['Cerdeña', 'Sardinia'],
      'IT-82': ['Sicilia', 'Sicily'],
      'IT-52': ['Toscana', 'Tuscany'],
      'IT-32': ['Trentino-Alto Adigio', 'Trentino-South Tyrol'],
      'IT-55': ['Umbría', 'Umbria'],
      'IT-34': ['Véneto', 'Veneto'],
    },
  },
  AU: {
    // The eight states and territories; the small outlying islands stay out.
    region: (p) => (/~$/.test(p.iso_3166_2) || p.name === 'Lord Howe Island' ? null : iso(p)),
    local: 'en',
  },
  JP: { region: iso, local: 'en', keep: (lon, lat) => lat > 24 && lon < 146 },
};

/** Fits the whole country in a square this many units wide. */
const SIZE = 1000;
const PAD = 16;
/** Neighbours are drawn this far past the country, as a share of the map. */
const CONTEXT = 0.6;
/** Islands under this many square units go, except each region's largest piece. */
const MIN_ISLAND = 2;
/** Simplify borders down to this much detail, in square units. */
const DETAIL = 3;
const DETAIL_AROUND = 25;

const admin1 = await load('ne_10m_admin_1_states_provinces.geojson');
mkdirSync(outDir, { recursive: true });
const wanted = process.argv.slice(2);
for (const [code, cfg] of Object.entries(COUNTRIES)) {
  if (wanted.length && !wanted.includes(code)) continue;
  build(code, cfg);
}

// How many regions each map has, so the country list doesn't load them all.
const index = {};
for (const file of readdirSync(outDir).sort()) {
  const m = /^([A-Z]{2})\.json$/.exec(file);
  if (m) index[m[1]] = JSON.parse(readFileSync(join(outDir, file), 'utf8')).regions.length;
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));

function build(code, cfg) {
  const own = [];
  const around = [];
  for (const f of admin1.features) {
    const p = f.properties;
    if (p.iso_a2 === 'AQ' || !f.geometry) continue;
    const id = p.iso_a2 === code ? cfg.region(p) : null;
    if (!id) {
      if (cfg.around && !cfg.around.includes(p.adm0_a3)) continue;
      around.push({ ...f, properties: { id: null, country: p.adm0_a3 } });
      continue;
    }
    const geometry = place(f.geometry, cfg);
    if (geometry) own.push({ ...f, geometry, properties: { id, p } });
  }

  // A conformal conic around the country keeps shapes as people know them.
  // The United States use the usual Albers with Alaska and Hawaii moved in.
  const fc = { type: 'FeatureCollection', features: own };
  let projection;
  if (code === 'US') projection = geoAlbersUsa();
  else {
    const [[lon0, lat0], [lon1, lat1]] = geoBounds(fc);
    const dl = (lat1 - lat0) / 6;
    projection = geoConicConformal()
      .parallels([lat0 + dl, lat1 - dl])
      .rotate([-(lon0 + lon1) / 2, 0])
      .precision(0.1);
  }
  projection.fitExtent([[PAD, PAD], [SIZE - PAD, SIZE - PAD]], fc);
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(fc);
  projection.translate(projection.translate().map((t, i) => t - [x0, y0][i] + PAD));
  const width = Math.ceil(x1 - x0 + 2 * PAD);
  const height = Math.ceil(y1 - y0 + 2 * PAD);
  // The neighbours reach past the map in every direction, far enough to
  // fill a tall phone screen even around a long, thin country.
  const reach = CONTEXT * Math.max(width, height);
  const clip = [[-reach, -reach], [width + reach, height + reach]];
  const flatOwn = geoProject(fc, projection);
  // Albers USA has no clip of its own; its lower 48 projection draws Canada.
  const aroundProjection =
    code === 'US' ? geoAlbers().scale(projection.scale()).translate(projection.translate()) : projection;
  aroundProjection.clipExtent(clip);
  // Neighbours: only provinces near the box, so the far side of the globe
  // never goes through the projection.
  const [[lon0, lat0], [lon1, lat1]] = geoBounds(fc);
  const margin = Math.max(lon1 - lon0, lat1 - lat0) * 1.5 + 8;
  const near = around.filter((f) => {
    const [[a0, b0], [a1, b1]] = geoBounds(f);
    // A country across the date line (the Aleutians) checks latitude only.
    const lonNear = lon0 > lon1 || (a1 > lon0 - margin && a0 < lon1 + margin);
    return lonNear && b1 > lat0 - margin && b0 < lat1 + margin;
  });
  const flatAround = geoProject({ type: 'FeatureCollection', features: near }, aroundProjection);
  flatAround.features = flatAround.features.filter((f) => f.geometry);
  for (const f of [...flatOwn.features, ...flatAround.features]) dropSpecks(f);

  let topo = topology({ own: flatOwn, around: flatAround });
  topo = presimplify(topo, planarTriangleArea);
  // Borders the country touches keep more detail than the neighbours' own.
  const ownArcs = new Set();
  const walk = (a) => (typeof a === 'number' ? ownArcs.add(a < 0 ? ~a : a) : a.forEach(walk));
  for (const g of topo.objects.own.geometries) walk(g.arcs ?? []);
  topo.arcs = topo.arcs.map((arc, i) => {
    const min = ownArcs.has(i) ? DETAIL : DETAIL_AROUND;
    return arc.filter((pt) => pt[2] >= min).map(([x, y]) => [x, y]);
  });
  topo.arcs = topo.arcs.map((arc) => chaikin(chaikin(arc)));

  // Provinces that make up one region, and neighbours' provinces, join into
  // one shape each.
  const merged = (geoms, key) => {
    const byKey = new Map();
    for (const g of geoms) {
      if (!g.type) continue;
      const k = key(g.properties);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(g);
    }
    return [...byKey].map(([k, gs]) => ({ ...mergeArcs(topo, gs), properties: { key: k, p: gs[0].properties.p } }));
  };
  const regions = merged(topo.objects.own.geometries, (p) => p.id);
  const others = merged(topo.objects.around.geometries, (p) => p.country);
  const color = fiveColors(neighbors(regions));

  const path = geoPath().digits(1);
  const r = (n) => Math.round(n * 10) / 10;
  const land = [];
  for (const g of others) {
    const d = dedupe(path(feature(topo, g)));
    if (d) land.push({ iso: null, d, c: 0 });
  }
  const places = [];
  regions.forEach((g, i) => {
    const f = feature(topo, g);
    const d = dedupe(path(f));
    if (!d) return;
    const id = g.properties.key;
    land.push({ iso: id, d, c: color[i] });
    const { main, box: [bx0, by0, bx1, by1] } = zoomBox(f, path);
    const center = path.centroid(main.g);
    const p = g.properties.p;
    const [es, en] = cfg.names?.[id] ?? [
      cfg.local === 'es' ? p.name : p.name_es ?? p.name,
      cfg.local === 'en' ? p.name : p.name_en ?? p.name,
    ];
    places.push({
      iso: id,
      en,
      es,
      tier: 0,
      tiny: Math.max(bx1 - bx0, by1 - by0) < 7,
      center: [r(center[0]), r(center[1])],
      box: [r(bx0), r(by0), r(bx1 - bx0), r(by1 - by0)],
      area: path.area(f),
    });
  });

  // Tiers by size: the big regions come first, the smallest last.
  const bySize = [...places].sort((a, b) => b.area - a.area);
  bySize.forEach((pl, i) => {
    pl.tier = pl.tiny ? 5 : 1 + Math.floor((i * 5) / bySize.length);
    delete pl.area;
  });

  // A rounded frame around each inset, so it reads as moved.
  const frames = (cfg.insets ?? []).map((id) => {
    const pl = places.find((x) => x.iso === id);
    const [bx, by, bw, bh] = pl.box;
    return roundRect(bx - 10, by - 10, bw + 20, bh + 20, 12);
  });

  places.sort((a, b) => a.iso.localeCompare(b.iso));
  const out = join(outDir, `${code}.json`);
  writeFileSync(out, JSON.stringify({ width, height, land, regions: places, frames }));
  const kb = (readFileSync(out).length / 1024).toFixed(0);
  console.log(`${code}: ${places.length} regions, ${others.length} neighbours, ${width}x${height}, ${kb} KB`);
  for (const pl of places) if (pl.tiny || /[~?]/.test(pl.es + pl.en)) console.log(`  ${pl.iso} ${pl.es} / ${pl.en}${pl.tiny ? ' (tiny)' : ''}`);
}

/** Keeps a country's pieces that `keep` allows, moved by `move`. */
function place(geometry, cfg) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  const kept = polys
    .filter((poly) => {
      if (!cfg.keep) return true;
      const [lon, lat] = geoCentroid({ type: 'Polygon', coordinates: poly });
      return cfg.keep(lon, lat);
    })
    .map((poly) => (cfg.move ? poly.map((ring) => ring.map(([lon, lat]) => cfg.move(lon, lat))) : poly));
  return kept.length ? { type: 'MultiPolygon', coordinates: kept } : null;
}

function dropSpecks(f) {
  if (f.geometry?.type !== 'MultiPolygon') return;
  const flatPath = geoPath();
  const polys = f.geometry.coordinates.map((c) => ({ c, a: flatPath.area({ type: 'Polygon', coordinates: c }) }));
  const max = Math.max(...polys.map((x) => x.a));
  f.geometry.coordinates = polys.filter((x) => x.a >= MIN_ISLAND || x.a === max).map((x) => x.c);
}

function roundRect(x, y, w, h, k) {
  const n = (v) => Math.round(v * 10) / 10;
  return (
    `M${n(x + k)} ${n(y)}H${n(x + w - k)}Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + k)}` +
    `V${n(y + h - k)}Q${n(x + w)} ${n(y + h)} ${n(x + w - k)} ${n(y + h)}` +
    `H${n(x + k)}Q${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - k)}` +
    `V${n(y + k)}Q${n(x)} ${n(y)} ${n(x + k)} ${n(y)}Z`
  );
}
