import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { FLAGS } from '@/data/flags';
import { useColors } from '@/theme';

/** A country's flag, 4:3, for the Flags mode's question. */
/** `radius` rounds the corners; small flags want less than the default. */
export function Flag({ iso, width, radius = 8 }: { iso: string; width: number | `${number}%`; radius?: number }) {
  const colors = useColors();
  const source = FLAGS[iso];
  if (!source) return null;
  return (
    <Image
      source={source}
      contentFit="cover"
      style={[styles.flag, { width, borderRadius: radius, borderColor: colors.border }]}
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  flag: { aspectRatio: 4 / 3, maxHeight: '80%', borderWidth: StyleSheet.hairlineWidth },
});
