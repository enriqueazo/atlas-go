import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { hasRealAds } from '@/ads/ads';
import { failed } from '@/cloud/ranked';
import { rewardAd, useWallet, watchAdForHint } from '@/cloud/wallet';
import { AD_HINTS, ADS_PER_DAY } from '@/game/shop';
import { useSettings } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

import { TestAd } from './TestAd';

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

/**
 * Once the wallet has no hints, as in Vocablo: watch a rewarded ad for one
 * (No ads gets it without the ad). `onReward` runs once the hint is in the
 * wallet, to use it right away. Shows nothing when today's ads are used up.
 */
export function AdHintButton({ onReward }: { onReward: () => void }) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (wallet.adsLeft <= 0) return null;

  const get = async (action: typeof rewardAd) => {
    setBusy(true);
    setNote(null);
    const r = await action();
    setBusy(false);
    if (failed(r)) setNote(t.shopError(r.error, ADS_PER_DAY));
    else onReward();
  };

  const press = () => {
    if (busy) return;
    if (wallet.adFree) get(rewardAd);
    else if (hasRealAds()) get(watchAdForHint);
    else setTestOpen(true);
  };

  const label = wallet.adFree ? t.adHintFree(AD_HINTS) : t.adHint(AD_HINTS);
  return (
    <View style={styles.adWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.adHintLabel(label, wallet.adsLeft)}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={press}
        style={({ pressed }) => [styles.adButton, pressed && { opacity: 0.8 }]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.green} />
        ) : (
          <MaterialCommunityIcons
            name={wallet.adFree ? 'lightbulb-on-outline' : 'television-play'}
            size={18}
            color={colors.green}
          />
        )}
        <Text style={styles.adLabel}>{label}</Text>
      </Pressable>
      {note && <Text style={styles.adNote}>{note}</Text>}
      <TestAd
        visible={testOpen}
        onClose={(watched) => {
          setTestOpen(false);
          if (watched) get(rewardAd);
        }}
      />
    </View>
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
    adWrap: { alignItems: 'center', gap: space(1) },
    adButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(2),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.green,
      backgroundColor: colors.greenSoft,
      paddingHorizontal: space(4),
      paddingVertical: space(2),
    },
    adLabel: { color: colors.green, fontFamily: fonts.bold, fontSize: 15 },
    adNote: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  }),
}));
