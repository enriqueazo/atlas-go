import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Board } from './complete';

type Saved = {
  /** Places painted so far. */
  filled: string[];
  /** Wrong taps across the whole map, shown when it's done. */
  misses: number;
};

const EMPTY: Saved = { filled: [], misses: 0 };
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
        setSaved({ filled: (s.filled ?? []).filter((iso) => known.has(iso)), misses: s.misses ?? 0 });
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
  const reset = useCallback(() => setSaved(EMPTY), []);

  const filled = useMemo(() => new Set(saved.filled), [saved.filled]);
  return { ready, filled, misses: saved.misses, total: board.regions.length, fill, miss, reset };
}
