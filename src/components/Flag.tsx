import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { FLAGS } from '@/data/flags';
import { useColors } from '@/theme';

/** A country's flag, 4:3, for the Flags mode's question. */
export function Flag({ iso, width }: { iso: string; width: number | `${number}%` }) {
  const colors = useColors();
  const source = FLAGS[iso];
  if (!source) return null;
  return (
    <Image
      source={source}
      contentFit="cover"
      style={[styles.flag, { width, borderColor: colors.border }]}
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  flag: { aspectRatio: 4 / 3, maxHeight: '80%', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
});
