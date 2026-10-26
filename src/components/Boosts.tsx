import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSettings } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

type Icon = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** The row under a question that holds the hint and discard buttons. */
export function Boosts({ children }: { children: ReactNode }) {
  const { styles } = useThemed();
  return <View style={styles.boosts}>{children}</View>;
}

/**
 * A help button with how many are left in the wallet, as in Vocablo's
 * BoostButton (the count is green: it comes from the stash). With none left
 * it opens the shop instead.
 */
export function BoostButton({
  icon,
  label,
  left,
  half = true,
  onPress,
}: {
  icon: Icon;
  label: string;
  left: number;
  /** Whether using it halves the points, to say so to screen readers. */
  half?: boolean;
  onPress: () => void;
}) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const empty = left <= 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={empty ? t.boostEmptyLabel(label) : t.boostLabel(label, left, half)}
      onPress={empty ? () => router.push('/shop') : onPress}
      style={({ pressed }) => [styles.button, empty && styles.empty, pressed && { opacity: 0.8 }]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={empty ? colors.textMuted : colors.purpleSoft} />
      <Text style={[styles.label, empty && { color: colors.textMuted }]}>{label}</Text>
      <View style={[styles.count, empty && { backgroundColor: colors.surfaceRaised }]}>
        {empty ? (
          <MaterialCommunityIcons name="storefront-outline" size={14} color={colors.textMuted} />
        ) : (
          <Text style={styles.countText}>{left}</Text>
        )}
      </View>
    </Pressable>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    boosts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space(2) },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(2),
      paddingVertical: space(2),
      paddingLeft: space(4),
      paddingRight: space(2),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.purpleDeep,
      backgroundColor: colors.tint,
    },
    empty: { borderColor: colors.border, backgroundColor: 'transparent' },
    label: { color: colors.purpleSoft, fontFamily: fonts.bold, fontSize: 15 },
    count: {
      minWidth: 24,
      height: 24,
      paddingHorizontal: space(1),
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.greenSoft,
    },
    countText: { color: colors.green, fontFamily: fonts.heavy, fontSize: 13 },
  }),
}));
