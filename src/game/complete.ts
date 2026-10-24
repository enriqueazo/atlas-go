import { COUNTRIES, LAND, MAP_HEIGHT, MAP_WIDTH, type Country, type LandShape } from './world';

/**
 * A map to fill in: the places to find and the shapes to tap. The world is the
 * first one; a country's provinces or states can plug in later as their own
 * board, with their own id so their progress is saved apart.
 */
export type Board = {
  id: string;
  width: number;
  height: number;
  /** Whether the map wraps around at its edges (the world does). */
  wraps: boolean;
  regions: Country[];
  shapes: LandShape[];
};

export const WORLD_BOARD: Board = {
  id: 'world',
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  wraps: true,
  regions: COUNTRIES,
  shapes: LAND,
};

/** Wrong taps on one place before the map shows where it is. */
export const MISSES_TO_REVEAL = 3;
/**
 * How close to a small place a tap must land, in screen pixels: generous for
 * the place being asked, tight for the rest so their rings don't swallow
 * taps on the big countries around them.
 */
const TARGET_HIT = 14;
const RING_HIT = 10;
/** Places smaller than this on screen, in pixels, also count taps around them. */
const SMALL = 12;
/** Places skipped recently stay out of the way for a while. */
const LATER = 8;

/**
 * The next place to find: the easiest tier left, so the map fills in from the
 * well-known countries to the microstates. Skipped places come back later.
 */
export function nextTarget(board: Board, filled: ReadonlySet<string>, skipped: string[]): Country | null {
  const left = board.regions.filter((r) => !filled.has(r.iso));
  if (!left.length) return null;
  const later = new Set(skipped.slice(-LATER));
  const fresh = left.filter((r) => !later.has(r.iso));
  const pool = fresh.length ? fresh : left;
  const easiest = Math.min(...pool.map((r) => r.tier));
  const tier = pool.filter((r) => r.tier <= easiest + 1);
  return tier[Math.floor(Math.random() * tier.length)];
}

// Hit testing. Shapes are SVG paths of straight lines (M, L, Z only), parsed
// once into rings with a bounding box, then tested even-odd.

type Ring = number[];
type Hit = { iso: string; rings: Ring[]; box: [number, number, number, number] };

const parsed = new WeakMap<Board, Hit[]>();

function hitsFor(board: Board): Hit[] {
  let hits = parsed.get(board);
  if (hits) return hits;
  hits = board.shapes
    .filter((s): s is LandShape & { iso: string } => !!s.iso)
    .map((s) => {
      const rings: Ring[] = [];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const part of s.d.split('M')) {
        if (!part) continue;
        const nums = part.replace(/Z/g, '').split(/[L,]/).map(Number);
        for (let i = 0; i < nums.length; i += 2) {
          x0 = Math.min(x0, nums[i]);
          x1 = Math.max(x1, nums[i]);
          y0 = Math.min(y0, nums[i + 1]);
          y1 = Math.max(y1, nums[i + 1]);
        }
        rings.push(nums);
      }
      return { iso: s.iso, rings, box: [x0, y0, x1, y1] };
    });
  parsed.set(board, hits);
  return hits;
}

function inside(h: Hit, x: number, y: number) {
  const [x0, y0, x1, y1] = h.box;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  let odd = false;
  for (const r of h.rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
    }
  }
  return odd;
}

/** Distance between two map points, the short way round on a wrapping map. */
function distance(board: Board, ax: number, ay: number, bx: number, by: number) {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (board.wraps) {
    dx = Math.min(dx, board.width - dx);
    dy = Math.min(dy, board.height - dy);
  }
  return Math.hypot(dx, dy);
}

/** Whether a place is drawn so small that taps around it count too. */
const isSmall = (r: Country, px: number) => r.tiny || Math.max(r.box[2], r.box[3]) / px < SMALL;

/**
 * What a tap at map point (x, y) means for `target`. `px` is map units per
 * screen pixel. The target wins any tie, so a tap on Rome finds Vatican City
 * when Vatican City is asked and Italy when Italy is.
 */
export function tapAt(
  board: Board,
  target: Country,
  x: number,
  y: number,
  px: number,
): { kind: 'right' } | { kind: 'wrong'; iso: string } | { kind: 'sea' } {
  if (board.wraps) {
    x = ((x % board.width) + board.width) % board.width;
    y = ((y % board.height) + board.height) % board.height;
  }
  const hits = hitsFor(board);
  const near = (r: Country, reach: number) =>
    isSmall(r, px) && distance(board, x, y, r.center[0], r.center[1]) <= reach * px;

  const own = hits.find((h) => h.iso === target.iso);
  if ((own && inside(own, x, y)) || near(target, TARGET_HIT)) return { kind: 'right' };

  // Tiny places first: their ring sits on top of whatever is under them.
  let ring: Country | null = null;
  let best = Infinity;
  for (const r of board.regions) {
    if (!r.tiny || !near(r, RING_HIT)) continue;
    const d = distance(board, x, y, r.center[0], r.center[1]);
    if (d < best) [ring, best] = [r, d];
  }
  if (ring) return { kind: 'wrong', iso: ring.iso };

  const hit = hits.find((h) => inside(h, x, y));
  return hit ? { kind: 'wrong', iso: hit.iso } : { kind: 'sea' };
}
