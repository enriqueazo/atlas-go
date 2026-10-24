import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

// Vocablo's two palettes (soft blacks, purples, greens and soft whites), plus
// the colours of Atlas Go's cartoon map. Dark is the original look; light
// swaps the soft blacks and whites.
const dark = {
  bg: '#121016',
  surface: '#1C1922',
  surfaceRaised: '#26222E',
  border: '#332D3D',
  text: '#F4F1FA',
  textMuted: '#A39DB0',
  purple: '#8B5CF6',
  purpleSoft: '#B79CFF',
  purpleDeep: '#5B3BC4',
  green: '#34D399',
  greenSoft: '#1E3B32',
  wrong: '#E879A6',
  wrongSoft: '#3A2230',
  /** Top of the screen gradient. */
  glow: '#1E1530',
  /** Purple-tinted surface: chips, your row in a table. */
  tint: '#2C2342',
  /** Text and icons on a purple button. */
  onPurple: '#FFFFFF',
  /** Map: sea, the little waves on it, the drop shadow under the land and the borders. */
  ocean: '#1A1C33',
  oceanDeep: '#151629',
  landShadow: '#0C0D1C',
  landStroke: '#121016',
  /** Map: five country fills, picked so neighbours never match. */
  land: ['#6E5AA8', '#3F8F7A', '#4F74B0', '#A8607F', '#9C8A4E'],
  /** Map: the country being asked and the capital dot. */
  highlight: '#C4ABFF',
  marker: '#FFFFFF',
};

export type Palette = typeof dark;

const light: Palette = {
  bg: '#F7F5FB',
  surface: '#FFFFFF',
  surfaceRaised: '#EFEBF7',
  border: '#E2DBEF',
  text: '#1C1922',
  textMuted: '#6B6478',
  purple: '#7C4DEB',
  purpleSoft: '#6A3FD6',
  purpleDeep: '#DCD0FA',
  green: '#16A372',
  greenSoft: '#DDF4EA',
  wrong: '#D14D85',
  wrongSoft: '#FBE4EE',
  glow: '#ECE4FC',
  tint: '#EDE6FC',
  onPurple: '#FFFFFF',
  ocean: '#CFE9FB',
  oceanDeep: '#BFE0F7',
  landShadow: '#9CC3E3',
  landStroke: '#4A4360',
  land: ['#FFD98A', '#9BE5BD', '#A8CDFF', '#FFB3CC', '#D2BFFF'],
  highlight: '#7C4DEB',
  marker: '#7C4DEB',
};

export const PALETTES = { dark, light };

export const fonts = {
  regular: 'Nunito_500Medium',
  bold: 'Nunito_700Bold',
  heavy: 'Nunito_800ExtraBold',
};

export const radius = { sm: 10, md: 18, lg: 28, pill: 999 };
export const space = (n: number) => n * 4;

/** 'system' follows the phone (light or dark); the others pick one. */
export type ThemeSetting = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

const KEY = 'theme';

type ThemeState = {
  scheme: Scheme;
  colors: Palette;
  setting: ThemeSetting;
  setSetting: (s: ThemeSetting) => void;
};

const ThemeContext = createContext<ThemeState>({
  scheme: 'dark',
  colors: dark,
  setting: 'system',
  setSetting: () => {},
});

export function resolveScheme(setting: ThemeSetting, system: string | null | undefined): Scheme {
  if (setting !== 'system') return setting;
  return system === 'light' ? 'light' : 'dark';
}

/** Keeps the chosen appearance (saved on the device) and the phone's own. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [setting, setSettingState] = useState<ThemeSetting>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((s) => {
        if (s === 'light' || s === 'dark' || s === 'system') setSettingState(s);
      })
      .catch(() => {});
  }, []);

  const setSetting = useCallback((s: ThemeSetting) => {
    setSettingState(s);
    AsyncStorage.setItem(KEY, s).catch(() => {});
  }, []);

  const scheme = resolveScheme(setting, system);
  const value = useMemo(
    () => ({ scheme, colors: PALETTES[scheme], setting, setSetting }),
    [scheme, setting, setSetting],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}

export function useColors(): Palette {
  return useContext(ThemeContext).colors;
}

/**
 * Styles that depend on the palette: `const useThemed = themed((colors) => ({ colors, styles }))`
 * at the bottom of a file, then `const { colors, styles } = useThemed()` in each component.
 * Built once per palette.
 */
export function themed<T>(factory: (colors: Palette) => T): () => T {
  const cache = new Map<Palette, T>();
  return () => {
    const colors = useColors();
    let value = cache.get(colors);
    if (value === undefined) {
      value = factory(colors);
      cache.set(colors, value);
    }
    return value;
  };
}
