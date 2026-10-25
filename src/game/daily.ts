import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Mode } from '@/settings';

import { levelFor, nextQuestion, PER_LEVEL, pointsFor, type Question, type Random } from './engine';
import { dayKey } from './stats';

// Map of the day: the same ten questions for everyone on the same date, mixed
// from the quiz modes and getting harder, as Vocablo's Palabra del día. A
// miss doesn't end it; the score is the points of the right answers. Rules
// first, storage at the bottom.

export const DAILY_ROUNDS = 10;
/** The modes take turns, so every day has some of each. */
const MODES: Mode[] = ['countries', 'flags', 'silhouette', 'capitals'];

/** A small seeded generator (mulberry32), so a date always gives the same questions. */
function seeded(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: a date as a number to seed with. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const cache = new Map<string, Question[]>();

/** Two questions per level, from level 1 to 5; `round` counts from 0. */
export const dailyLevel = (round: number) => levelFor(Math.floor(round / 2) * PER_LEVEL);

/** The day's questions, the same on every phone for the same date. */
export function dailyQuestions(day: string): Question[] {
  let questions = cache.get(day);
  if (questions) return questions;
  const random = seeded(hash(`atlas-go/${day}`));
  const recent: string[] = [];
  questions = Array.from({ length: DAILY_ROUNDS }, (_, i) => {
    const q = nextQuestion(MODES[i % MODES.length], Math.floor(i / 2) * PER_LEVEL, recent, random);
    recent.push(q.target.iso);
    return q;
  });
  cache.set(day, questions);
  return questions;
}

export type DailyRecord = {
  /** The day being played, or last played. */
  day: string | null;
  /** The option picked on each question of that day, in order. */
  picks: number[];
  /** Days finished in a row, up to lastDone. */
  streak: number;
  bestStreak: number;
  lastDone: string | null;
};

export const EMPTY_DAILY: DailyRecord = { day: null, picks: [], streak: 0, bestStreak: 0, lastDone: null };

/** Today's picks; none when the saved ones are from another day. */
export const picksFor = (r: DailyRecord, day: string) => (r.day === day ? r.picks : []);

export type DailyScore = { points: number; correct: number; results: boolean[] };

export function scoreDay(day: string, picks: number[]): DailyScore {
  const questions = dailyQuestions(day);
  const results = picks.map((p, i) => p === questions[i].answer);
  const points = results.reduce((sum, right, i) => sum + (right ? pointsFor(questions[i]) : 0), 0);
  return { points, correct: results.filter(Boolean).length, results };
}

/** Most points a day can give. */
export const maxPoints = (day: string) => dailyQuestions(day).reduce((sum, q) => sum + pointsFor(q), 0);

function yesterday(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** Adds an answer to the day; the last one finishes it and moves the streak. */
export function pick(r: DailyRecord, day: string, option: number): DailyRecord {
  const picks = [...picksFor(r, day), option];
  if (picks.length > DAILY_ROUNDS) return r;
  const next = { ...r, day, picks };
  if (picks.length < DAILY_ROUNDS) return next;
  const streak = r.lastDone === yesterday(day) ? r.streak + 1 : 1;
  return { ...next, streak, bestStreak: Math.max(r.bestStreak, streak), lastDone: day };
}

/** The streak as it stands today: it is lost once a whole day goes by unplayed. */
export function currentStreak(r: DailyRecord, today: string): number {
  return r.lastDone === today || r.lastDone === yesterday(today) ? r.streak : 0;
}

/** The result as squares to share, one per question. */
export const squares = (results: boolean[]) => results.map((right) => (right ? '🟩' : '🟥')).join('');

// Storage.

const KEY = 'atlas-go/daily/v1';

export async function getDaily(): Promise<DailyRecord> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY_DAILY, ...(JSON.parse(raw) as Partial<DailyRecord>) } : EMPTY_DAILY;
  } catch {
    return EMPTY_DAILY;
  }
}

export function saveDaily(r: DailyRecord): Promise<void> {
  return AsyncStorage.setItem(KEY, JSON.stringify(r)).catch(() => {});
}
