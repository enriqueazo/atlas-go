import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { fonts, radius, space, themed } from '@/theme';

// Screen, Button and Chip as in Vocablo's src/components/ui.tsx.

/** `glow` tints the top of the screen, e.g. to mark a round that plays differently. */
export function Screen({ children, glow }: { children: ReactNode; glow?: string }) {
  const { colors, styles } = useThemed();
  return (
    <LinearGradient colors={[glow ?? colors.glow, colors.bg, colors.bg]} locations={[0, 0.45, 1]} style={styles.screen}>
      {children}
    </LinearGradient>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  style?: ViewStyle;
}) {
  const { colors, styles } = useThemed();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.buttonPrimary : styles.buttonGhost,
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
        style,
      ]}
    >
      <Text style={[styles.buttonLabel, variant === 'ghost' && { color: colors.purpleSoft }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'purple' | 'green' }) {
  const { colors, styles } = useThemed();
  const toneStyle =
    tone === 'purple'
      ? { backgroundColor: colors.tint, color: colors.purpleSoft }
      : tone === 'green'
        ? { backgroundColor: colors.greenSoft, color: colors.green }
        : { backgroundColor: colors.surfaceRaised, color: colors.textMuted };
  return (
    <View style={[styles.chip, { backgroundColor: toneStyle.backgroundColor }]}>
      <Text style={[styles.chipLabel, { color: toneStyle.color }]}>{label}</Text>
    </View>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: space(5) },
    button: {
      borderRadius: radius.pill,
      paddingVertical: space(4),
      paddingHorizontal: space(8),
      alignItems: 'center',
    },
    buttonPrimary: {
      backgroundColor: colors.purple,
      shadowColor: colors.purple,
      shadowOpacity: 0.45,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    buttonGhost: { backgroundColor: 'transparent' },
    buttonLabel: { color: colors.onPurple, fontFamily: fonts.heavy, fontSize: 18, letterSpacing: 0.3 },
    chip: { borderRadius: radius.pill, paddingVertical: space(1), paddingHorizontal: space(3) },
    chipLabel: { fontFamily: fonts.bold, fontSize: 13 },
  }),
}));
