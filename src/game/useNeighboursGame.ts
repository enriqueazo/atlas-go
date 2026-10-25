import { useRef, useState } from 'react';

import type { Flash, Mark } from '@/components/WorldMap';
import neighbours from '@/data/neighbours.json';
import type { Cue } from '@/sounds';
import { useSettings } from '@/settings';

import { placeAt, WORLD_BOARD } from './complete';
import { levelFor } from './engine';
import { trackAnswer, trackRun } from './stats';
import { BY_ISO, type Country } from './world';

// Neighbours: a country lights up and the player taps every country it shares
// a land border with (scripts/build-neighbours.mjs). Each one found scores;
// a wrong tap or giving up costs a life, and the run ends with the last one.
// Levels climb with the countries completed, as in the quiz modes.

const NEIGHBOURS = neighbours as Record<string, string[]>;
export const LIVES = 3;
/** Countries asked recently stay out for a while. */
const RECENT = 20;

/** Countries with at least one land neighbour. */
export const BORDERED: Country[] = Object.keys(NEIGHBOURS).map((iso) => BY_ISO.get(iso)!);

/** Points for each border found: harder countries are worth more. */
export const pointsFor = (target: Country) => target.tier * 10;

export function nextTarget(done: number, recent: string[]): Country {
  const level = levelFor(done);
  const skip = new Set(recent.slice(-RECENT));
  let pool = BORDERED.filter((c) => c.tier <= level && !skip.has(c.iso));
  if (!pool.length) pool = BORDERED.filter((c) => c.tier <= level);
  // The newest tier shows up most, older tiers keep appearing.
  const weight = (c: Country) => (c.tier === level ? 3 : c.tier === level - 1 ? 2 : 1);
  let r = Math.random() * pool.reduce((sum, c) => sum + weight(c), 0);
  for (const c of pool) {
    r -= weight(c);
    if (r <= 0) return c;
  }
  return pool[pool.length - 1];
}

/** What the last tap said, shown under the country. */
export type NeighbourNote =
  | { kind: 'found'; iso: string }
  | { kind: 'wrong'; iso: string }
  | { kind: 'self' }
  | { kind: 'again'; iso: string }
  | { kind: 'sea' };

export function useNeighboursGame(play: (cue: Cue) => void) {
  const { records, saveRecord } = useSettings();
  const [target, setTarget] = useState<Country | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [lives, setLives] = useState(LIVES);
  const [points, setPoints] = useState(0);
  // Countries completed this run, which sets the level.
  const [done, setDone] = useState(0);
  // The round is over: every border found, or given up and shown.
  const [revealed, setRevealed] = useState(false);
  const [note, setNote] = useState<NeighbourNote | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [isRecord, setIsRecord] = useState(false);
  // Wrong taps this round: a round with none counts the country as known.
  const misses = useRef(0);
  const recent = useRef<string[]>([]);
  const runId = useRef(0);
  const celebrated = useRef(false);

  const borders = target ? NEIGHBOURS[target.iso] : [];
  const complete = !!target && found.length === borders.length;
  const over = lives === 0;

  const ask = (n: number) => {
    const t = nextTarget(n, recent.current);
    recent.current = [...recent.current.slice(-40), t.iso];
    setTarget(t);
    setFound([]);
    setRevealed(false);
    setNote(null);
    setFlash(null);
    misses.current = 0;
  };

  const start = () => {
    recent.current = [];
    runId.current = Date.now();
    celebrated.current = false;
    setLives(LIVES);
    setPoints(0);
    setDone(0);
    setIsRecord(false);
    ask(0);
  };

  /** Ends the round; `lost` when given up or out of lives. */
  const finish = (lost: boolean, total: number, n: number) => {
    setRevealed(true);
    trackAnswer({ mode: 'neighbours', iso: target!.iso, correct: !lost && misses.current === 0 });
    trackRun('neighbours', { id: runId.current, points: total, streak: n, at: Date.now() });
  };

  const loseLife = () => {
    const left = lives - 1;
    setLives(left);
    if (left === 0) finish(true, points, done);
    return left;
  };

  const tap = (x: number, y: number, px: number) => {
    if (!target || revealed || over) return;
    const iso = placeAt(WORLD_BOARD, x, y, px);
    if (!iso) return setNote({ kind: 'sea' });
    if (iso === target.iso) return setNote({ kind: 'self' });
    if (found.includes(iso)) return setNote({ kind: 'again', iso });
    const now = Date.now();
    if (borders.includes(iso)) {
      const total = points + pointsFor(target);
      const all = [...found, iso];
      const beat = total > records.neighbours;
      const fanfare = beat && !celebrated.current && records.neighbours > 0;
      if (beat) {
        celebrated.current = true;
        saveRecord('neighbours', total);
      }
      setFound(all);
      setPoints(total);
      setIsRecord((r) => r || fanfare);
      setFlash({ iso, kind: 'right', at: now });
      setNote({ kind: 'found', iso });
      play(fanfare ? 'record' : 'correct');
      if (all.length === borders.length) {
        setDone(done + 1);
        finish(false, total, done + 1);
      } else {
        // Saved as it grows, so quitting mid-country keeps the points.
        trackRun('neighbours', { id: runId.current, points: total, streak: done, at: now });
      }
    } else {
      misses.current += 1;
      setFlash({ iso, kind: 'wrong', at: now });
      setNote({ kind: 'wrong', iso });
      play('wrong');
      loseLife();
    }
  };

  /** Shows the borders left, for a life. */
  const giveUp = () => {
    if (!target || revealed || over) return;
    play('wrong');
    setNote(null);
    if (loseLife() > 0) finish(true, points, done);
  };

  const next = () => {
    play('tap');
    if (over) start();
    else ask(done);
  };

  const marks: Mark[] = target
    ? [
        ...found.map((iso) => ({ iso, kind: 'found' as const })),
        ...(revealed ? borders.filter((iso) => !found.includes(iso)).map((iso) => ({ iso, kind: 'missed' as const })) : []),
      ]
    : [];

  return {
    target,
    borders,
    found,
    lives,
    points,
    done,
    revealed,
    complete,
    over,
    note,
    flash,
    marks,
    isRecord,
    start,
    tap,
    giveUp,
    next,
  };
}
