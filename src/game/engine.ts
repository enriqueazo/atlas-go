import type { Mode } from '@/settings';

import { COUNTRIES, type Country } from './world';

export type Question = {
  mode: Mode;
  target: Country;
  options: Country[];
  answer: number;
};

export const MAX_LEVEL = 5;
export const PER_LEVEL = 5;
const RECENT = 20;

/** A new tier opens every few right answers in a row. */
export const levelFor = (streak: number) => Math.min(MAX_LEVEL, 1 + Math.floor(streak / PER_LEVEL));

/** Points for a right answer: harder countries are worth more. */
export const pointsFor = (q: Question) => q.target.tier * 10;

const playable = (mode: Mode) =>
  mode === 'capitals' ? COUNTRIES.filter((c) => c.capital) : COUNTRIES;

function pickWeighted<T>(items: T[], weight: (t: T) => number) {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = Math.random() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

function shuffle<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nextQuestion(mode: Mode, streak: number, recent: string[]): Question {
  const level = levelFor(streak);
  const all = playable(mode);
  const skip = new Set(recent.slice(-RECENT));
  let pool = all.filter((c) => c.tier <= level && !skip.has(c.iso));
  if (!pool.length) pool = all.filter((c) => c.tier <= level);

  // The newest tier shows up most, older tiers keep appearing.
  const target = pickWeighted(pool, (c) => (c.tier === level ? 3 : c.tier === level - 1 ? 2 : 1));

  // Distractors get closer to the answer as the level climbs: same region,
  // similar difficulty. Early on they stay among well-known countries.
  const near = level >= 3;
  const candidates = all
    .filter((c) => c.iso !== target.iso && c.tier <= Math.max(level, target.tier) + 1)
    .map((c) => {
      let score = Math.random() * 2;
      if (c.region === target.region) score += near ? 4 : 2;
      else if (c.continent === target.continent) score += near ? 2 : 1.5;
      if (Math.abs(c.tier - target.tier) <= 1) score += 1;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
  const distractors = candidates.slice(0, 2).map((x) => x.c);

  const options = shuffle([target, ...distractors]);
  return { mode, target, options, answer: options.indexOf(target) };
}

export const optionLabel = (q: Question, c: Country, lang: 'es' | 'en') =>
  q.mode === 'capitals' ? c.capital![lang] : c[lang];
