// Shared by build-map.mjs (the world) and build-regions.mjs (a country's
// regions): Natural Earth downloads and the cartoon touches.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = join(dirname(fileURLToPath(import.meta.url)), '.cache');
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';

/** A Natural Earth GeoJSON file, downloaded once to scripts/.cache (gitignored). */
export async function load(name) {
  mkdirSync(cache, { recursive: true });
  const file = join(cache, name);
  if (!existsSync(file)) {
    const res = await fetch(NE + name);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Rounds the corners of a line (Chaikin), for the soft cartoon outline. */
export function chaikin(arc) {
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

/** Five map colours so no two neighbours share one; `adj` from topojson's neighbors(). */
export function fiveColors(adj) {
  const color = new Array(adj.length).fill(-1);
  const order = [...adj.keys()].sort((a, b) => adj[b].length - adj[a].length);
  for (const i of order) {
    const used = new Set(adj[i].map((j) => color[j]));
    let c = (i * 7) % 5;
    for (let k = 0; k < 5 && used.has(c); k++) c = (c + 1) % 5;
    color[i] = c;
  }
  return color;
}

// Rounding to one decimal leaves runs of repeated points; drop them.
export function dedupe(d) {
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

/**
 * Zoom box for a feature: its largest polygon plus nearby parts, so island
 * chains stay together while far-off pieces (French Guiana for France,
 * Chukotka across the date line) stay out. `path` is a geoPath on flat data.
 */
export function zoomBox(f, path) {
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
  return { main, box: [bx0, by0, bx1, by1] };
}
