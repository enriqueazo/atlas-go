import type { EdgeInsets } from 'react-native-safe-area-context';

import type { Palette } from '@/theme';

/** Vocablo's tab bar. The game screen hides it while a game is on. */
export const tabBarStyle = (colors: Palette, insets: EdgeInsets) => ({
  backgroundColor: colors.surface,
  borderTopColor: colors.border,
  height: 62 + insets.bottom,
  paddingTop: 6,
  paddingBottom: insets.bottom + 6,
});
