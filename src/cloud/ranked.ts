import { errorCode } from '@/game/leagues';

import { ensureAccount, lastCloudError } from './account';
import { supabase } from './supabase';

// Ranked games, leagues, rankings and groups. Everything is decided on the
// server; these are thin wrappers over its functions. Each one resolves to
// { error } instead of throwing, with the server's code ('profile_required',
// 'group_not_found'…) or 'offline'.

export type Failure = { error: string };
export type Result<T> = T | Failure;

export function failed<T>(r: Result<T>): r is Failure {
  return typeof r === 'object' && r !== null && 'error' in r;
}

export async function call<T>(fn: string, args?: Record<string, unknown>): Promise<Result<T>> {
  if (!supabase || !(await ensureAccount())) return { error: 'offline' };
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      console.warn('[ranked]', fn, error.message);
      return { error: errorCode(error.message) };
    }
    return data as T;
  } catch (e) {
    console.warn('[ranked]', fn, e, lastCloudError());
    return { error: 'offline' };
  }
}

export type RankedGame = { id: string; rounds: number; seconds: number };

/** A question as the server sends it: the mode, the place to draw, and the three options in order. */
export type RankedQuestion =
  | {
      done: false;
      round: number;
      mode: 'countries' | 'capitals' | 'silhouette' | 'flags';
      iso: string;
      options: string[];
      level: number;
      ms_left: number;
    }
  | { done: true; score: number; correct: number; played: number };

export type RankedAnswer = {
  correct: boolean;
  late: boolean;
  points: number;
  answer: string;
  score: number;
  done: boolean;
};

/** Starts a ranked game; `data` is RANKED_DATA, which must match the server's places. */
export function startRankedGame(data: string) {
  return call<RankedGame>('start_ranked_game', { p_data: data });
}

export function rankedNext(game: string) {
  return call<RankedQuestion>('ranked_next', { p_game: game });
}

/** `iso` is the place picked, or null when time ran out. */
export function rankedAnswer(game: string, iso: string | null) {
  return call<RankedAnswer>('ranked_answer', { p_game: game, p_iso: iso });
}

export type LeagueRow = { rank: number; nickname: string; country: string | null; points: number; me: boolean; zone: -1 | 0 | 1 };

export type League = {
  tier: number;
  ends_at: string;
  joined: boolean;
  last_change: -1 | 0 | 1 | null;
  rows: LeagueRow[];
};

export function myLeague() {
  return call<League>('my_league');
}

export type Scope = 'global' | 'country' | 'group';
export type Period = 'week' | 'all';

export type RankingRow = { rank: number; nickname: string; country: string; points: number; me: boolean };

export type Ranking = { rows: RankingRow[]; me: { rank: number; points: number } | null; total: number };

export function ranking(scope: Scope, period: Period, group?: string) {
  return call<Ranking>('ranking', { p_scope: scope, p_period: period, p_group: group ?? null });
}

export type Group = { id: string; name: string; code: string; members?: number };

export function myGroups() {
  return call<Group[]>('my_groups');
}

export function createGroup(name: string) {
  return call<Group>('create_group', { p_name: name });
}

export function joinGroup(code: string) {
  return call<Group>('join_group', { p_code: code });
}

export function leaveGroup(id: string) {
  return call<null>('leave_group', { p_group: id });
}
