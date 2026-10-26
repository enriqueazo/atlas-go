import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Flash } from '@/components/WorldMap';
import type { Cue } from '@/sounds';

import { MISSES_TO_REVEAL, MISS_PENALTY, nextTarget, tapAt, type Board } from './complete';
import type { useBoardProgress } from './progress';
import { trackAnswer, trackCountryMap, trackMap, trackRegion } from './stats';
import type { Place } from './world';

/** What the last tap said, shown under the place to find. */
export type Note =
  | { kind: 'right'; iso: string }
  | { kind: 'wrong'; iso: string }
  | { kind: 'sea' }
  | { kind: 'outside' };

/**
 * Complete the map: name a place, the player taps it to paint it. Wrong taps
 * light up what was tapped, and after a few the map shows where it is. The
 * clock runs while the mode is open, and each wrong tap adds to it: the goal
 * is the whole map in the least time. A hint from the wallet shows it right away.
 */
export function useCompleteGame(board: Board, progress: ReturnType<typeof useBoardProgress>, play: (cue: Cue) => void) {
  const [target, setTarget] = useState<Place | null>(null);
  const [misses, setMisses] = useState(0);
  // A hint from the wallet showed where the place is.
  const [shown, setShown] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const skipped = useRef<string[]>([]);
  // When the clock last started, or null while it is stopped.
  const since = useRef<number | null>(null);
  const [record, setRecord] = useState(false);
  // The world map's countries count toward the Progress tab's known
  // countries and continents; a country's regions toward the day and totals.
  const world = board.id === 'world';
  const track = (correct: boolean) =>
    world ? trackAnswer({ mode: 'countries', iso: target!.iso, correct }) : trackRegion(correct);

  /** Saves the time since the clock last started; keeps it running if asked. */
  const bank = (running: boolean) => {
    const now = Date.now();
    if (since.current !== null) progress.addTime(now - since.current);
    since.current = running ? now : null;
  };

  // The clock stops while the app is in the background.
  const active = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!active.current) return;
      if (state === 'active') since.current ??= Date.now();
      else bank(false);
    });
    return () => sub.remove();
  });

  const pick = (filled: ReadonlySet<string>) => {
    setTarget(nextTarget(board, filled, skipped.current));
    setMisses(0);
    setShown(false);
  };

  const start = () => {
    skipped.current = [];
    setNote(null);
    setFlash(null);
    setRecord(false);
    active.current = true;
    const done = progress.filled.size >= progress.total;
    since.current = done ? null : Date.now();
    pick(progress.filled);
  };

  const stop = () => {
    bank(false);
    active.current = false;
  };

  const tap = (x: number, y: number, px: number) => {
    if (!target) return;
    const hit = tapAt(board, target, x, y, px);
    if (hit.kind === 'right') {
      const filled = new Set(progress.filled).add(target.iso);
      const last = filled.size === progress.total;
      const now = Date.now();
      const time = progress.ms + (since.current === null ? 0 : now - since.current) + progress.misses * MISS_PENALTY;
      bank(!last);
      progress.fill(target.iso);
      // Found on the first tap, without a hint, counts as known, for the Progress tab.
      track(misses === 0 && !shown);
      setFlash({ iso: target.iso, kind: 'right', at: now });
      setNote({ kind: 'right', iso: target.iso });
      if (last) {
        const beat = progress.best === null || time < progress.best;
        progress.finish(time);
        const map = { ms: time, misses: progress.misses, at: now };
        if (world) trackMap(map);
        else trackCountryMap(board.id, map);
        setRecord(beat && progress.best !== null);
        play(beat ? 'record' : 'correct');
      } else {
        play('correct');
      }
      pick(filled);
    } else if (hit.kind === 'wrong') {
      progress.miss();
      setFlash({ iso: hit.iso, kind: 'wrong', at: Date.now() });
      setNote(hit);
      setMisses((m) => m + 1);
      play('wrong');
    } else {
      setNote(hit);
    }
  };

  const skip = () => {
    if (!target) return;
    play('tap');
    if (misses > 0 || shown) track(false);
    skipped.current = [...skipped.current, target.iso];
    setNote(null);
    pick(progress.filled);
  };

  /** Shows where the place is, as after a few misses. The caller pays for it from the wallet first. */
  const showMe = () => {
    if (!target || shown || misses >= MISSES_TO_REVEAL) return;
    setShown(true);
    play('help');
  };

  const restart = () => {
    play('zoom');
    progress.reset();
    skipped.current = [];
    since.current = Date.now();
    setNote(null);
    setFlash(null);
    setRecord(false);
    pick(new Set());
  };

  /** The time on the clock now, misses included. */
  const elapsed = () =>
    progress.ms + (since.current === null ? 0 : Date.now() - since.current) + progress.misses * MISS_PENALTY;

  return {
    target,
    flash,
    note,
    /** Missed too often: the map shows where the place is. */
    revealed: shown || misses >= MISSES_TO_REVEAL,
    done: !target && progress.filled.size >= progress.total,
    /** The finished map beat an earlier best time. */
    record,
    running: since.current !== null,
    elapsed,
    start,
    stop,
    tap,
    skip,
    showMe,
    restart,
  };
}
