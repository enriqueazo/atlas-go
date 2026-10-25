import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Mode } from '@/settings';

import { BY_ISO, COUNTRIES, type Country } from './world';

// What the Ranking and Progress tabs show, kept on the device: answers per
// day and per continent, which places the player knows, the best runs and
// the finished maps. Rules first, storage at the bottom, as in Vocablo's
// progress.ts and activity.ts.

/** Days of activity kept; enough for streaks and the week view. */
export const KEEP_DAYS = 120;
/** Best runs and map times kept per mode, for the Ranking tab. */
export const KEEP_RUNS = 10;

export type Tally = { answers: number; correct: number };

/** A run in Countries or Capitals: points climb until the first miss. */
export type Run = { id: number; points: number; streak: number; at: number };
/** A whole world map painted, misses included in the time. */
export type MapTime = { ms: number; misses: number; at: number };
/** A finished map of the day: its points and right answers out of the rounds. */
export type DailyResult = { day: string; points: number; correct: number; at: number };

export const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'] as const;
export type Continent = (typeof CONTINENTS)[number];

export type Stats = {
  /** Answers per local day, keyed YYYY-MM-DD. */
  days: Record<string, Tally>;
  /** Answers per continent, Complete the map included. */
  continents: Record<Continent, Tally>;
  /**
   * Each place's last answer, true when it was right. Complete the map counts
   * for countries: a place found on the first tap is right.
   */
  known: Record<Mode, Record<string, boolean>>;
  /** Most right answers in a row. */
  bestStreak: Record<Mode, number>;
  runs: Record<Mode, Run[]>;
  maps: MapTime[];
  /** Whole maps painted, all time. */
  mapsDone: number;
  /** Answers on countries' maps (regions), which have no continent. */
  regions: Tally;
  /** Best times on each country's map, by board id. */
  countryMaps: Record<string, MapTime[]>;
  /** Each country's maps painted, all time, by board id. */
  countryMapsDone: Record<string, number>;
  /** Best maps of the day. */
  dailies: DailyResult[];
  /** Maps of the day finished, all time. */
  dailiesDone: number;
};

export function emptyStats(): Stats {
  const tallies = Object.fromEntries(CONTINENTS.map((c) => [c, { answers: 0, correct: 0 }])) as Stats['continents'];
  return {
    days: {},
    continents: tallies,
    known: { countries: {}, capitals: {}, silhouette: {}, flags: {}, neighbours: {} },
    bestStreak: { countries: 0, capitals: 0, silhouette: 0, flags: 0, neighbours: 0 },
    runs: { countries: [], capitals: [], silhouette: [], flags: [], neighbours: [] },
    maps: [],
    mapsDone: 0,
    regions: { answers: 0, correct: 0 },
    countryMaps: {},
    countryMapsDone: {},
    dailies: [],
    dailiesDone: 0,
  };
}

/** The local calendar day of `date`, as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Natural Earth puts a few island nations in the "Seven seas"; they go with their region. */
export function continentOf(c: Country): Continent {
  if ((CONTINENTS as readonly string[]).includes(c.continent)) return c.continent as Continent;
  return c.region.endsWith('Africa') ? 'Africa' : c.region.endsWith('Asia') ? 'Asia' : 'Oceania';
}

export type AnswerEvent = { mode: Mode; iso: string; correct: boolean };

export function addAnswer(s: Stats, e: AnswerEvent, now: Date): Stats {
  const country = BY_ISO.get(e.iso);
  const continent = country ? continentOf(country) : null;
  return {
    ...addDay(s, e.correct, now),
    continents: continent ? { ...s.continents, [continent]: tally(s.continents[continent], e.correct) } : s.continents,
    known: { ...s.known, [e.mode]: { ...s.known[e.mode], [e.iso]: e.correct } },
  };
}

function addDay(s: Stats, correct: boolean, now: Date): Stats {
  const key = dayKey(now);
  return { ...s, days: trimDays({ ...s.days, [key]: tally(s.days[key], correct) }, now) };
}

/** A region found, or missed, on a country's map: it counts toward the day and the totals. */
export function addRegionAnswer(s: Stats, correct: boolean, now: Date): Stats {
  return { ...addDay(s, correct, now), regions: tally(s.regions, correct) };
}

/** Saves a run as it grows: the same id replaces the earlier score. */
export function addRun(s: Stats, mode: Mode, run: Run): Stats {
  const others = s.runs[mode].filter((r) => r.id !== run.id);
  return {
    ...s,
    bestStreak: { ...s.bestStreak, [mode]: Math.max(s.bestStreak[mode], run.streak) },
    runs: { ...s.runs, [mode]: topRuns([...others, run]) },
  };
}

export function addMap(s: Stats, map: MapTime): Stats {
  return { ...s, maps: topMaps([...s.maps, map]), mapsDone: s.mapsDone + 1 };
}

export function addCountryMap(s: Stats, id: string, map: MapTime): Stats {
  return {
    ...s,
    countryMaps: { ...s.countryMaps, [id]: topMaps([...(s.countryMaps[id] ?? []), map]) },
    countryMapsDone: { ...s.countryMapsDone, [id]: (s.countryMapsDone[id] ?? 0) + 1 },
  };
}

/** Most points first; on a tie, the earlier day keeps its place. */
export function addDaily(s: Stats, result: DailyResult): Stats {
  const dailies = [...s.dailies.filter((d) => d.day !== result.day), result]
    .sort((a, b) => b.points - a.points || a.at - b.at)
    .slice(0, KEEP_RUNS);
  return { ...s, dailies, dailiesDone: s.dailiesDone + 1 };
}

/** Fastest first; on a tie, the earlier map keeps its place. */
function topMaps(maps: MapTime[]) {
  return maps.sort((a, b) => a.ms - b.ms || a.at - b.at).slice(0, KEEP_RUNS);
}

/** Most points first; on a tie, the earlier run keeps its place. */
function topRuns(runs: Run[]) {
  return runs.sort((a, b) => b.points - a.points || a.at - b.at).slice(0, KEEP_RUNS);
}

/**
 * Days in a row with at least one answer, ending today. A streak that ended
 * yesterday still counts, so it doesn't look lost before today's first game.
 */
export function dayStreak(days: Record<string, Tally>, now: Date): number {
  const d = new Date(now);
  if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days[dayKey(d)]) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export type WeekDay = { key: string; index: number; answers: number; isToday: boolean; isFuture: boolean };

/** This week, Monday to Sunday, with the answers given on each day. */
export function weekActivity(days: Record<string, Tally>, now: Date): WeekDay[] {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const today = dayKey(now);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    const key = dayKey(d);
    return { key, index, answers: days[key]?.answers ?? 0, isToday: key === today, isFuture: key > today };
  });
}

/** Since Monday at midnight, local time, for the "This week" tables. */
export function weekStart(now: Date): number {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday.getTime();
}

/** Places whose last answer was right, per difficulty tier (1 to 5). */
export function knownByTier(known: Record<string, boolean>, playable: Country[]): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const c of playable) if (known[c.iso]) counts[c.tier - 1] += 1;
  return counts;
}

export const capitalCountries = () => COUNTRIES.filter((c) => c.capital);

export function accuracy(t: Tally): number | null {
  return t.answers > 0 ? Math.round((t.correct / t.answers) * 100) : null;
}

export function totals(s: Stats): Tally {
  return [...Object.values(s.continents), s.regions].reduce(
    (a, t) => ({ answers: a.answers + t.answers, correct: a.correct + t.correct }),
    { answers: 0, correct: 0 },
  );
}

function tally(t: Tally | undefined, correct: boolean): Tally {
  return { answers: (t?.answers ?? 0) + 1, correct: (t?.correct ?? 0) + (correct ? 1 : 0) };
}

function trimDays(days: Record<string, Tally>, now: Date): Record<string, Tally> {
  const oldest = new Date(now);
  oldest.setDate(now.getDate() - KEEP_DAYS);
  const cutoff = dayKey(oldest);
  return Object.fromEntries(Object.entries(days).filter(([k]) => k > cutoff));
}

// Storage.

const KEY = 'atlas-go/stats/v1';

// Answers can come quickly, so writes go one after another instead of
// overwriting each other.
let queue: Promise<void> = Promise.resolve();

export async function getStats(): Promise<Stats> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyStats();
    const saved = JSON.parse(raw) as Partial<Stats>;
    const empty = emptyStats();
    return {
      ...empty,
      ...saved,
      continents: { ...empty.continents, ...saved.continents },
      known: { ...empty.known, ...saved.known },
      bestStreak: { ...empty.bestStreak, ...saved.bestStreak },
      runs: { ...empty.runs, ...saved.runs },
    };
  } catch {
    return emptyStats();
  }
}

function change(update: (s: Stats) => Stats): Promise<void> {
  queue = queue
    .then(async () => {
      const s = await getStats();
      await AsyncStorage.setItem(KEY, JSON.stringify(update(s)));
    })
    .catch(() => {});
  return queue;
}

export const trackAnswer = (e: AnswerEvent) => change((s) => addAnswer(s, e, new Date()));
export const trackRun = (mode: Mode, run: Run) => change((s) => addRun(s, mode, run));
export const trackMap = (map: MapTime) => change((s) => addMap(s, map));
export const trackRegion = (correct: boolean) => change((s) => addRegionAnswer(s, correct, new Date()));
export const trackCountryMap = (id: string, map: MapTime) => change((s) => addCountryMap(s, id, map));
export const trackDaily = (result: DailyResult) => change((s) => addDaily(s, result));
