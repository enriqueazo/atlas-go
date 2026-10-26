import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { TEST_AD_SECONDS } from '@/game/shop';
import { useSettings } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

import { Button } from './ui';

/**
 * Vocablo's stand-in for a rewarded ad until AdMob is added (it needs a new
 * development build): a few seconds of "ad", then the reward. Closing it
 * early gives nothing, like a real one.
 */
export function TestAd({ visible, onClose }: { visible: boolean; onClose: (watched: boolean) => void }) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const [left, setLeft] = useState(TEST_AD_SECONDS);

  useEffect(() => {
    if (!visible) return;
    setLeft(TEST_AD_SECONDS);
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => onClose(false)}>
      <View style={styles.screen}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.testAdClose}
          onPress={() => onClose(false)}
          hitSlop={12}
          style={styles.close}
        >
          <MaterialCommunityIcons name="close" size={26} color={colors.textMuted} />
        </Pressable>
        <View style={styles.box}>
          <MaterialCommunityIcons name="television-play" size={56} color={colors.purpleSoft} />
          <Text style={styles.title}>{t.testAdTitle}</Text>
          <Text style={styles.text}>{t.testAdBody}</Text>
          {left > 0 ? (
            <Text style={styles.count}>{t.testAdIn(left)}</Text>
          ) : (
            <Button label={t.testAdGet} onPress={() => onClose(true)} />
          )}
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
    count: { color: colors.purpleSoft, fontFamily: fonts.bold, fontSize: 16, paddingVertical: space(3) },
  }),
}));
