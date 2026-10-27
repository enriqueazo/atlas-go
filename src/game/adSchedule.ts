// When the full-screen ads come up in solo games, as in Vocablo (pure rules; src/ads/ads.ts
// keeps the plan on the phone and shows the ads). Each mode's first ad of
// the day comes after 3 answers. After that, every visit to the mode (each
// time it's opened, or the app is opened again) counts from zero: the first
// ad after 6 answers, then further and further apart, so the more someone
// plays, the fewer ads they see.

/** Answers before a mode's first ad of the day. */
export const FIRST_AD_OF_DAY = 3;
/** Answers before each later ad in one visit: the 1st, the 2nd, ... and every later one. */
export const AD_GAPS = [6, 10, 15, 20, 25, 30];

/**
 * The solo modes that show full-screen ads. Ranked games, duels and the map
 * of the day never do. In Complete the map and Complete a country each place
 * painted is an answer, and the ad waits until the player leaves the map, so
 * it never runs against the clock.
 */
export type AdMode = 'countries' | 'capitals' | 'silhouette' | 'flags' | 'neighbours' | 'complete' | 'country';

/** One visit to a mode. Not saved: reopening the app starts new visits. */
type Visit = { answered: number; nextAt: number; step: number };

export type AdPlan = {
  /** The local day (YYYY-MM-DD) `firstShown` is for. */
  day: string;
  /** The modes that have shown their first ad today. Saved on the phone. */
  firstShown: AdMode[];
  visits: Partial<Record<AdMode, Visit>>;
};

export const EMPTY_PLAN: AdPlan = { day: '', firstShown: [], visits: {} };

function gap(step: number): number {
  return AD_GAPS[Math.min(step, AD_GAPS.length - 1)];
}

/** The plan for `day`: a new day brings back every mode's 3-answer ad. */
export function forDay(plan: AdPlan, day: string): AdPlan {
  return plan.day === day ? plan : { ...plan, day, firstShown: [] };
}

function newVisit(plan: AdPlan, mode: AdMode): Visit {
  return plan.firstShown.includes(mode) ? { answered: 0, nextAt: gap(0), step: 1 } : { answered: 0, nextAt: FIRST_AD_OF_DAY, step: 0 };
}

function visit(plan: AdPlan, mode: AdMode): Visit {
  return plan.visits[mode] ?? newVisit(plan, mode);
}

/** The player opened `mode`: its count starts again. */
export function startVisit(plan: AdPlan, mode: AdMode, day: string): AdPlan {
  const p = forDay(plan, day);
  return { ...p, visits: { ...p.visits, [mode]: newVisit(p, mode) } };
}

/** One more question answered in `mode`. */
export function countAnswer(plan: AdPlan, mode: AdMode, day: string): AdPlan {
  const p = forDay(plan, day);
  const v = visit(p, mode);
  return { ...p, visits: { ...p.visits, [mode]: { ...v, answered: v.answered + 1 } } };
}

/** Whether a full-screen ad is due in `mode` now. */
export function isDue(plan: AdPlan, mode: AdMode, day: string): boolean {
  const v = visit(forDay(plan, day), mode);
  return v.answered >= v.nextAt;
}

/** A full-screen ad was shown in `mode`: the next one is a longer gap away. */
export function markShown(plan: AdPlan, mode: AdMode, day: string): AdPlan {
  const p = forDay(plan, day);
  const v = visit(p, mode);
  const firstShown = p.firstShown.includes(mode) ? p.firstShown : [...p.firstShown, mode];
  return {
    ...p,
    firstShown,
    visits: { ...p.visits, [mode]: { ...v, nextAt: v.answered + gap(v.step), step: v.step + 1 } },
  };
}

/** A rewarded ad was watched: every visit's next full-screen ad moves one gap further away. */
export function postpone(plan: AdPlan, day: string): AdPlan {
  const p = forDay(plan, day);
  const visits: AdPlan['visits'] = {};
  for (const [mode, v] of Object.entries(p.visits) as [AdMode, Visit][]) {
    visits[mode] = { ...v, nextAt: Math.max(v.nextAt, v.answered) + gap(v.step) };
  }
  return { ...p, visits };
}
