import type { Duel } from '@/game/duels';

import { call, type RankedGame } from './ranked';

// Duels. Like ranked games, everything is decided on the server; these are
// thin wrappers that resolve to { error } instead of throwing. A duel game
// is played with the ranked game functions (rankedNext, rankedAnswer) once
// playDuel has started it.

export type DuelQuestion = {
  round: number;
  mode: 'countries' | 'capitals' | 'silhouette' | 'flags';
  iso: string;
  me: { correct: boolean; points: number } | null;
  them: { correct: boolean; points: number } | null;
};

/** Challenges a player by name, or with no name makes a link duel and returns its code. */
export function createDuel(data: string, nickname?: string) {
  return call<{ id: string; code: string | null }>('create_duel', { p_data: data, p_nickname: nickname ?? null });
}

export function joinDuel(code: string) {
  return call<{ id: string }>('join_duel', { p_code: code });
}

/** Joins someone waiting for a random rival, or starts waiting for one (matched: false). */
export function randomDuel(data: string) {
  return call<{ id: string; matched: boolean }>('random_duel', { p_data: data });
}

export function declineDuel(id: string) {
  return call<null>('decline_duel', { p_duel: id });
}

export function cancelDuel(id: string) {
  return call<null>('cancel_duel', { p_duel: id });
}

/** Starts the player's game in a duel, or goes back to it. */
export function playDuel(data: string, id: string) {
  return call<RankedGame>('play_duel', { p_data: data, p_duel: id });
}

export function myDuels() {
  return call<Duel[]>('my_duels');
}

/** The duel's questions with both answers (the rival's once it's over); empty before the player has played. */
export function duelDetail(id: string) {
  return call<DuelQuestion[]>('duel_detail', { p_duel: id });
}
