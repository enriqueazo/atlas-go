import { useRef, useState } from 'react';

import type { Flash } from '@/components/WorldMap';
import type { Cue } from '@/sounds';

import { MISSES_TO_REVEAL, nextTarget, tapAt, type Board } from './complete';
import type { useBoardProgress } from './progress';
import type { Country } from './world';

/** What the last tap said, shown under the place to find. */
export type Note = { kind: 'right'; iso: string } | { kind: 'wrong'; iso: string } | { kind: 'sea' };

/**
 * Complete the map: name a place, the player taps it to paint it. Wrong taps
 * light up what was tapped, and after a few the map shows where it is.
 */
export function useCompleteGame(board: Board, progress: ReturnType<typeof useBoardProgress>, play: (cue: Cue) => void) {
  const [target, setTarget] = useState<Country | null>(null);
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const skipped = useRef<string[]>([]);

  const pick = (filled: ReadonlySet<string>) => {
    setTarget(nextTarget(board, filled, skipped.current));
    setMisses(0);
  };

  const start = () => {
    skipped.current = [];
    setNote(null);
    setFlash(null);
    pick(progress.filled);
  };

  const tap = (x: number, y: number, px: number) => {
    if (!target) return;
    const hit = tapAt(board, target, x, y, px);
    if (hit.kind === 'right') {
      const filled = new Set(progress.filled).add(target.iso);
      progress.fill(target.iso);
      setFlash({ iso: target.iso, kind: 'right', at: Date.now() });
      setNote({ kind: 'right', iso: target.iso });
      play(filled.size === progress.total ? 'record' : 'correct');
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
    skipped.current = [...skipped.current, target.iso];
    setNote(null);
    pick(progress.filled);
  };

  const restart = () => {
    play('zoom');
    progress.reset();
    skipped.current = [];
    setNote(null);
    setFlash(null);
    pick(new Set());
  };

  return {
    target,
    flash,
    note,
    /** Missed too often: the map shows where the place is. */
    revealed: misses >= MISSES_TO_REVEAL,
    done: !target && progress.filled.size >= progress.total,
    start,
    tap,
    skip,
    restart,
  };
}
