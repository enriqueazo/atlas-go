import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Board } from './complete';

type Saved = {
  /** Places painted so far. */
  filled: string[];
  /** Wrong taps on this run; each one adds to the time. */
  misses: number;
  /** Time played on this run, in milliseconds, misses not included. */
  ms: number;
  /** Best time for a whole map, misses included; kept when starting over. */
  best: number | null;
};

const EMPTY: Saved = { filled: [], misses: 0, ms: 0, best: null };
const key = (board: Board) => `atlas-go/complete/${board.id}/v1`;

/** How far the player got filling in a board, saved on the device. */
export function useBoardProgress(board: Board) {
  const [saved, setSaved] = useState<Saved>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    setSaved(EMPTY);
    AsyncStorage.getItem(key(board))
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw) as Partial<Saved>;
        // Drop places the board no longer has, in case the map data changes.
        const known = new Set(board.regions.map((r) => r.iso));
        setSaved({
          filled: (s.filled ?? []).filter((iso) => known.has(iso)),
          misses: s.misses ?? 0,
          ms: s.ms ?? 0,
          best: s.best ?? null,
        });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [board]);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(key(board), JSON.stringify(saved)).catch(() => {});
  }, [saved, ready, board]);

  const fill = useCallback((iso: string) => {
    setSaved((s) => (s.filled.includes(iso) ? s : { ...s, filled: [...s.filled, iso] }));
  }, []);
  const miss = useCallback(() => setSaved((s) => ({ ...s, misses: s.misses + 1 })), []);
  const addTime = useCallback((ms: number) => setSaved((s) => ({ ...s, ms: s.ms + ms })), []);
  /** Keeps a finished map's time if it beats the best. */
  const finish = useCallback((time: number) => {
    setSaved((s) => (s.best === null || time < s.best ? { ...s, best: time } : s));
  }, []);
  const reset = useCallback(() => setSaved((s) => ({ ...EMPTY, best: s.best })), []);

  const filled = useMemo(() => new Set(saved.filled), [saved.filled]);
  return {
    ready,
    filled,
    misses: saved.misses,
    ms: saved.ms,
    best: saved.best,
    total: board.regions.length,
    fill,
    miss,
    addTime,
    finish,
    reset,
  };
}
