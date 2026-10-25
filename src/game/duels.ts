// Duels: the small rules the app needs. The duel itself runs on the server
// (supabase/migrations/*_duels.sql).

/** Same as private.duel_rules() on the server. */
export const DUEL_HOURS = 48;

export type DuelSide = { played: boolean; correct: number | null; score: number | null; ms: number | null };

export type Duel = {
  id: string;
  kind: 'friend' | 'link' | 'random';
  status: 'waiting' | 'active' | 'done' | 'expired' | 'declined';
  /** Link duels you made: the code to share, until someone takes it. */
  code: string | null;
  /** Whether you started it. */
  mine: boolean;
  rival: string | null;
  rival_country: string | null;
  expires_at: string;
  finished_at: string | null;
  to_play: boolean;
  me: DuelSide & { started: boolean };
  them: DuelSide;
  result: 'won' | 'lost' | 'draw' | null;
};

/** The link that opens a duel in the app; the code also works typed in. */
export const duelLink = (code: string) => `atlasgo://duel/${code}`;

/** A code typed by hand: 6 letters or digits, any case, spaces ignored. */
export function cleanCode(text: string): string | null {
  const code = text.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}

export const isOpen = (d: Duel) => d.status === 'waiting' || d.status === 'active';

/** Minutes left until the duel ends. */
export const minutesLeft = (d: Duel, now: Date) => Math.floor((new Date(d.expires_at).getTime() - now.getTime()) / 60_000);

/** Total time as "1:05" (minutes and seconds). */
export function durationLabel(ms: number | null): string {
  if (ms === null) return '–';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
