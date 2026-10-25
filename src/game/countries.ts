import counts from '@/data/regions/index.json';

import type { Board } from './complete';
import { BY_ISO, type LandShape, type Place } from './world';

type RegionsData = { width: number; height: number; land: LandShape[]; regions: Place[]; frames: string[] };

// Each country's map is only parsed when it is played, so the list stays quick.
const DATA: Record<string, () => RegionsData> = {
  AR: () => require('@/data/regions/AR.json'),
  AU: () => require('@/data/regions/AU.json'),
  BR: () => require('@/data/regions/BR.json'),
  CA: () => require('@/data/regions/CA.json'),
  CL: () => require('@/data/regions/CL.json'),
  CO: () => require('@/data/regions/CO.json'),
  DE: () => require('@/data/regions/DE.json'),
  ES: () => require('@/data/regions/ES.json'),
  FR: () => require('@/data/regions/FR.json'),
  IT: () => require('@/data/regions/IT.json'),
  JP: () => require('@/data/regions/JP.json'),
  MX: () => require('@/data/regions/MX.json'),
  PE: () => require('@/data/regions/PE.json'),
  US: () => require('@/data/regions/US.json'),
};

/** What a country's regions are called, in plural. */
const UNITS: Record<string, { es: string; en: string }> = {
  AR: { es: 'provincias', en: 'provinces' },
  AU: { es: 'estados y territorios', en: 'states and territories' },
  BR: { es: 'estados', en: 'states' },
  CA: { es: 'provincias y territorios', en: 'provinces and territories' },
  CL: { es: 'regiones', en: 'regions' },
  CO: { es: 'departamentos', en: 'departments' },
  DE: { es: 'estados federados', en: 'states' },
  ES: { es: 'comunidades autónomas', en: 'autonomous communities' },
  FR: { es: 'regiones', en: 'regions' },
  IT: { es: 'regiones', en: 'regions' },
  JP: { es: 'prefecturas', en: 'prefectures' },
  MX: { es: 'estados', en: 'states' },
  PE: { es: 'regiones', en: 'regions' },
  US: { es: 'estados', en: 'states' },
};

export type CountryMap = {
  /** The country's ISO code, as on the world map. */
  iso: string;
  /** Its board id, which keys its saved progress and record. */
  id: string;
  en: string;
  es: string;
  unit: { es: string; en: string };
  regions: number;
};

export const boardId = (iso: string) => `country-${iso}`;

/**
 * The countries whose map can be completed, fewest regions first so the list
 * runs from quick maps to long ones.
 */
export const COUNTRY_MAPS: CountryMap[] = Object.entries(counts as Record<string, number>)
  .map(([iso, regions]) => {
    const c = BY_ISO.get(iso)!;
    return { iso, id: boardId(iso), en: c.en, es: c.es, unit: UNITS[iso], regions };
  })
  .sort((a, b) => a.regions - b.regions || a.en.localeCompare(b.en));

export const COUNTRY_MAP_BY_ID = new Map(COUNTRY_MAPS.map((m) => [m.id, m]));

const boards = new Map<string, Board>();

/** A country's map to fill in, loaded the first time it is asked for. */
export function countryBoard(iso: string): Board {
  let board = boards.get(iso);
  if (board) return board;
  const data = DATA[iso]();
  board = {
    id: boardId(iso),
    width: data.width,
    height: data.height,
    wraps: false,
    regions: data.regions,
    shapes: data.land,
    country: iso,
    frames: data.frames,
  };
  boards.set(iso, board);
  return board;
}
