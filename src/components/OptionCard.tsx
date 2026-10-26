import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, space, themed, type Palette } from '@/theme';

// Vocablo's OptionCard, without the "¿Cuál sobra?" state.

export type OptionStatus = 'idle' | 'correct' | 'wrong' | 'dimmed' | 'discarded';

const LETTERS = ['A', 'B', 'C', 'D'];

export function OptionCard({
  index,
  text,
  status,
  disabled,
  onPress,
}: {
  index: number;
  text: string;
  status: OptionStatus;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, styles } = useThemed();
  const tone = tones(colors)[status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: status === 'correct' || status === 'wrong' }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: tone.bg, borderColor: tone.border, opacity: status === 'dimmed' || status === 'discarded' ? 0.45 : 1 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={[styles.badge, { backgroundColor: tone.badge }]}>
        <Text style={[styles.badgeText, { color: tone.badgeText }]}>
          {status === 'correct' ? '✓' : status === 'wrong' || status === 'discarded' ? '✕' : LETTERS[index]}
        </Text>
      </View>
      <Text style={[styles.text, status === 'discarded' && styles.discarded]}>{text}</Text>
    </Pressable>
  );
}

const tones = (colors: Palette): Record<OptionStatus, { bg: string; border: string; badge: string; badgeText: string }> => ({
  idle: { bg: colors.surface, border: colors.border, badge: colors.surfaceRaised, badgeText: colors.purpleSoft },
  dimmed: { bg: colors.surface, border: colors.border, badge: colors.surfaceRaised, badgeText: colors.textMuted },
  discarded: { bg: 'transparent', border: colors.border, badge: colors.surfaceRaised, badgeText: colors.textMuted },
  correct: { bg: colors.greenSoft, border: colors.green, badge: colors.green, badgeText: colors.bg },
  wrong: { bg: colors.wrongSoft, border: colors.wrong, badge: colors.wrong, badgeText: colors.bg },
});

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(3),
      padding: space(4),
      borderRadius: radius.md,
      borderWidth: 1.5,
    },
    badge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    badgeText: { fontFamily: fonts.heavy, fontSize: 15 },
    text: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
    discarded: { color: colors.textMuted, textDecorationLine: 'line-through' },
  }),
}));
