// Vocablo design system, adapted for Atlas Go. Colour, spacing and radius
// values come from Vocablo's tokens; the map palette is Atlas Go's own.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

const dark = {
  bg: '#121016',
  surface: '#1c1922',
  surfaceRaised: '#26222e',
  border: '#332d3d',
  text: '#f4f1fa',
  textMuted: '#a39db0',
  purple: '#8b5cf6',
  purpleSoft: '#b79cff',
  purpleDeep: '#5b3bc4',
  green: '#34d399',
  greenSoft: '#1e3b32',
  wrong: '#e879a6',
  wrongSoft: '#3a2230',
  glow: '#1e1530',
  tint: '#2c2342',
  hintBg: '#211a30',
  onPurple: '#ffffff',
  // Map
  ocean: '#1a1c33',
  oceanDeep: '#151629',
  landShadow: '#0c0d1c',
  landStroke: '#121016',
  land: ['#6e5aa8', '#3f8f7a', '#4f74b0', '#a8607f', '#9c8a4e'],
  highlight: '#c4abff',
  marker: '#ffffff',
};

export type Palette = typeof dark;

const light: Palette = {
  bg: '#f7f5fb',
  surface: '#ffffff',
  surfaceRaised: '#efebf7',
  border: '#e2dbef',
  text: '#1c1922',
  textMuted: '#6b6478',
  purple: '#7c4deb',
  purpleSoft: '#6a3fd6',
  purpleDeep: '#dcd0fa',
  green: '#16a372',
  greenSoft: '#ddf4ea',
  wrong: '#d14d85',
  wrongSoft: '#fbe4ee',
  glow: '#ece4fc',
  tint: '#ede6fc',
  hintBg: '#f3eefd',
  onPurple: '#ffffff',
  ocean: '#cfe9fb',
  oceanDeep: '#bfe0f7',
  landShadow: '#9cc3e3',
  landStroke: '#4a4360',
  land: ['#ffd98a', '#9be5bd', '#a8cdff', '#ffb3cc', '#d2bfff'],
  highlight: '#7c4deb',
  marker: '#7c4deb',
};

export const palettes = { dark, light };
export type ThemeName = keyof typeof palettes;

export const fonts = {
  regular: 'Nunito_500Medium',
  bold: 'Nunito_700Bold',
  heavy: 'Nunito_800ExtraBold',
};

export const radius = { sm: 10, md: 18, lg: 28, pill: 999 };

export const space = (n: number) => n * 4;

// Type scale from the Vocablo guide.
export const type = {
  score: { fontFamily: fonts.heavy, fontSize: 72, lineHeight: 79 },
  title: { fontFamily: fonts.heavy, fontSize: 32, lineHeight: 38 },
  titleSub: { fontFamily: fonts.heavy, fontSize: 24, lineHeight: 29 },
  verdict: { fontFamily: fonts.heavy, fontSize: 20, lineHeight: 24 },
  button: { fontFamily: fonts.heavy, fontSize: 18, lineHeight: 22, letterSpacing: 0.3 },
  cardTitle: { fontFamily: fonts.heavy, fontSize: 18, lineHeight: 23 },
  counter: { fontFamily: fonts.heavy, fontSize: 17, lineHeight: 20, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  option: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  chip: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 18, letterSpacing: 0.3 },
} satisfies Record<string, TextStyle>;

export const tabBarStyle = (c: Palette) => ({
  backgroundColor: c.surface,
  borderTopColor: c.border,
  borderTopWidth: 1,
  minHeight: 62,
  paddingTop: 6,
});

type ThemeValue = { name: ThemeName; c: Palette };
const ThemeContext = createContext<ThemeValue>({ name: 'dark', c: dark });

/** Follows the phone unless the player picks a theme in Settings. */
export function ThemeProvider({
  choice,
  children,
}: {
  choice: 'system' | ThemeName;
  children: ReactNode;
}) {
  const scheme = useColorScheme();
  const name: ThemeName = choice === 'system' ? (scheme === 'light' ? 'light' : 'dark') : choice;
  const value = useMemo(() => ({ name, c: palettes[name] }), [name]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Palette-aware StyleSheet: `const useStyles = themed((c) => ({ ... }))`. */
type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function themed<S extends Styles>(make: (c: Palette) => S & Styles) {
  const cache = new Map<Palette, Readonly<S>>();
  return () => {
    const { c } = useTheme();
    let styles = cache.get(c);
    if (!styles) {
      styles = StyleSheet.create(make(c));
      cache.set(c, styles);
    }
    return styles;
  };
}
