import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { setTestInterstitial } from '@/ads/ads';
import { useSettings } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

/** Seconds before the test full-screen ad can be closed. */
const CLOSE_AFTER_SECONDS = 3;

/**
 * Vocablo's stand-in for the full-screen ad between questions in builds without
 * AdMob (Expo Go, web), so the ad schedule can be tried out. Render once,
 * at the root.
 */
export function TestInterstitialHost() {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const [visible, setVisible] = useState(false);
  const [left, setLeft] = useState(CLOSE_AFTER_SECONDS);
  const done = useRef<(() => void) | null>(null);

  useEffect(() => {
    setTestInterstitial(
      () =>
        new Promise<void>((resolve) => {
          done.current = resolve;
          setLeft(CLOSE_AFTER_SECONDS);
          setVisible(true);
        }),
    );
    return () => setTestInterstitial(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  const close = () => {
    if (left > 0) return;
    setVisible(false);
    done.current?.();
    done.current = null;
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close}>
      <View style={styles.screen}>
        {left > 0 ? (
          <Text style={[styles.close, styles.count]}>{left}</Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.interstitialClose}
            onPress={close}
            hitSlop={12}
            style={styles.close}
          >
            <MaterialCommunityIcons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        )}
        <View style={styles.box}>
          <MaterialCommunityIcons name="television-play" size={56} color={colors.purpleSoft} />
          <Text style={styles.title}>{t.testAdTitle}</Text>
          <Text style={styles.text}>{t.interstitialBody}</Text>
        </View>
      </View>
    </Modal>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space(6) },
    close: { position: 'absolute', top: space(12), right: space(6) },
    count: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 18 },
    box: {
      width: '100%',
      maxWidth: 420,
      alignItems: 'center',
      gap: space(4),
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(8),
    },
    title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 24 },
    text: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  }),
}));
