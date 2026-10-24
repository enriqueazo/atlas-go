import data from '@/data/world.json';

export type Country = {
  iso: string;
  en: string;
  es: string;
  continent: string;
  region: string;
  /** 1 (everyone knows it) to 5 (microstates and small islands). */
  tier: number;
  /** Too small to see at world scale; drawn with a ring around it. */
  tiny: boolean;
  center: [number, number];
  /** Zoom frame in map units: x, y, width, height. */
  box: [number, number, number, number];
  capital: { en: string; es: string; x: number; y: number } | null;
};

export type LandShape = { iso: string | null; d: string; c: number };

export const MAP_WIDTH: number = data.width;
export const MAP_HEIGHT: number = data.height;
export const LAND = data.land as LandShape[];
export const COUNTRIES = data.countries as Country[];
export const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));
