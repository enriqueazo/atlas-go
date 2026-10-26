import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CLOUD_READY } from '@/cloud/config';
import { failed } from '@/cloud/ranked';
import { claimDailyGift, rewardAd, syncWallet, testPurchase, useWallet } from '@/cloud/wallet';
import { TestAd } from '@/components/TestAd';
import { Button, Chip, Screen } from '@/components/ui';
import { AD_HINTS, ADS_PER_DAY, GIFT_DISCARDS, giftClaimedToday, PRODUCTS, type Product } from '@/game/shop';
import { useSettings } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

type Icon = ComponentProps<typeof MaterialCommunityIcons>['name'];

// The shop, as in Vocablo: the wallet, the daily gift, rewarded ads and the
// packs. Until the store accounts exist, purchases are test purchases
// (nothing is charged) and the ad is a stand-in.
export default function Shop() {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const shopErrorMessage = (code: string) => t.shopError(code, ADS_PER_DAY);
  const wallet = useWallet();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [buying, setBuying] = useState<Product | null>(null);

  useFocusEffect(
    useCallback(() => {
      syncWallet().then((r) => {
        setReady(true);
        if (failed(r)) setMessage({ text: shopErrorMessage(r.error), ok: false });
      });
    }, []),
  );

  const run = async (action: () => ReturnType<typeof rewardAd>, done: string) => {
    setBusy(true);
    const r = await action();
    setBusy(false);
    setMessage(failed(r) ? { text: shopErrorMessage(r.error), ok: false } : { text: done, ok: true });
  };

  const claimGift = () => run(claimDailyGift, t.giftDone(GIFT_DISCARDS));

  const adWatched = (watched: boolean) => {
    setAdOpen(false);
    if (watched) run(rewardAd, t.adDone(AD_HINTS));
  };

  const buy = (p: Product) => {
    setBuying(null);
    run(() => testPurchase(p.id), t.purchaseDone(t.products[p.id].title));
  };

  const giftDone = giftClaimedToday(wallet);
  const adsLeft = wallet.adsLeft;

  return (
    <Screen>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.back} onPress={() => router.back()} hitSlop={12}>
            <MaterialCommunityIcons name="chevron-left" size={30} color={colors.textMuted} />
          </Pressable>
          <Text style={styles.title}>{t.shop}</Text>
          {busy && <ActivityIndicator color={colors.purple} style={{ marginLeft: 'auto' }} />}
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.testNote}>
            <MaterialCommunityIcons name="flask-outline" size={18} color={colors.purpleSoft} />
            <Text style={styles.testText}>
              {t.shopTest}
              {CLOUD_READY ? '' : ` ${t.shopLocal}`}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>{t.walletTitle}</Text>
            <View style={styles.balances}>
              <Balance icon="lightbulb-on-outline" count={wallet.hints} label={t.hintsUnit(wallet.hints)} />
              <Balance icon="close-circle-outline" count={wallet.discards} label={t.discardsUnit(wallet.discards)} />
            </View>
            <Text style={styles.muted}>{t.walletHow}</Text>
            <Text style={styles.muted}>{t.walletWhere}</Text>
          </View>

          {message && <Text style={[styles.message, !message.ok && { color: colors.wrong }]}>{message.text}</Text>}
          {!ready && <ActivityIndicator color={colors.purple} />}

          <Offer
            icon="gift-outline"
            title={t.giftTitle}
            detail={t.giftDetail(GIFT_DISCARDS)}
            action={giftDone ? null : t.giftCollect}
            doneLabel={t.giftLater}
            onPress={claimGift}
            disabled={busy}
          />
          <Offer
            icon={wallet.adFree ? 'lightbulb-on-outline' : 'television-play'}
            title={wallet.adFree ? t.adFreeTitle : t.adTitle}
            detail={t.adDetail(AD_HINTS, adsLeft, ADS_PER_DAY)}
            action={adsLeft > 0 ? (wallet.adFree ? t.adReceive : t.adWatch) : null}
            doneLabel={t.adLater}
            onPress={() => (wallet.adFree ? adWatched(true) : setAdOpen(true))}
            disabled={busy}
          />

          <Text style={styles.heading}>{t.packs}</Text>
          {PRODUCTS.map((p) => (
            <Offer
              key={p.id}
              icon={p.adFree ? 'cancel' : p.hints ? 'lightbulb-on-outline' : 'close-circle-outline'}
              title={t.products[p.id].title}
              detail={t.products[p.id].detail}
              action={p.adFree && wallet.adFree ? null : p.price}
              doneLabel={t.bought}
              onPress={() => setBuying(p)}
              disabled={busy || !wallet.testPurchases}
            />
          ))}
          <Text style={styles.muted}>{t.restoreLater}</Text>
        </ScrollView>
      </SafeAreaView>

      <TestAd visible={adOpen} onClose={adWatched} />
      <Modal visible={buying !== null} transparent animationType="fade" onRequestClose={() => setBuying(null)}>
        <View style={styles.backdrop}>
          {buying && (
            <View style={styles.sheet}>
              <Chip label={t.testPurchase} tone="purple" />
              <Text style={styles.big}>{t.products[buying.id].title}</Text>
              <Text style={styles.muted}>{t.testPurchaseBody(buying.price)}</Text>
              <View style={styles.sheetActions}>
                <Button label={t.cancel} variant="ghost" onPress={() => setBuying(null)} style={{ flex: 1 }} />
                <Button label={t.buy} onPress={() => buy(buying)} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </Screen>
  );
}

function Balance({ icon, count, label }: { icon: Icon; count: number; label: string }) {
  const { colors, styles } = useThemed();
  return (
    <View style={styles.balance}>
      <MaterialCommunityIcons name={icon} size={26} color={colors.purpleSoft} />
      <Text style={styles.balanceCount}>{count}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function Offer({
  icon,
  title,
  detail,
  action,
  doneLabel,
  onPress,
  disabled,
}: {
  icon: Icon;
  title: string;
  detail: string;
  /** The button's text, or null when it's done for now. */
  action: string | null;
  doneLabel: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors, styles } = useThemed();
  return (
    <View style={styles.offer}>
      <View style={styles.offerIcon}>
        <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
      </View>
      <View style={styles.offerText}>
        <Text style={styles.offerTitle}>{title}</Text>
        <Text style={styles.offerDetail}>{detail}</Text>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}: ${action}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [styles.offerButton, disabled && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.offerButtonText}>{action}</Text>
        </Pressable>
      ) : (
        <Text style={styles.offerDone}>{doneLabel}</Text>
      )}
    </View>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(3) },
    title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 28 },
    body: { paddingBottom: space(10), gap: space(3) },
    testNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(2),
      backgroundColor: colors.tint,
      borderRadius: radius.md,
      padding: space(3),
    },
    testText: { flex: 1, color: colors.purpleSoft, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(5),
      gap: space(3),
    },
    section: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18 },
    heading: { color: colors.text, fontFamily: fonts.heavy, fontSize: 20, marginTop: space(3) },
    big: { color: colors.text, fontFamily: fonts.heavy, fontSize: 22 },
    muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
    message: { color: colors.green, fontFamily: fonts.bold, fontSize: 15, textAlign: 'center' },
    balances: { flexDirection: 'row', gap: space(3) },
    balance: {
      flex: 1,
      alignItems: 'center',
      gap: space(1),
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingVertical: space(4),
    },
    balanceCount: { color: colors.text, fontFamily: fonts.heavy, fontSize: 30 },
    offer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(3),
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(4),
    },
    offerIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.purpleDeep,
      alignItems: 'center',
      justifyContent: 'center',
    },
    offerText: { flex: 1, gap: 2 },
    offerTitle: { color: colors.text, fontFamily: fonts.heavy, fontSize: 16 },
    offerDetail: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
    offerButton: {
      backgroundColor: colors.purple,
      borderRadius: radius.md,
      paddingHorizontal: space(4),
      paddingVertical: space(2),
      minWidth: 76,
      alignItems: 'center',
    },
    offerButtonText: { color: colors.onPurple, fontFamily: fonts.heavy, fontSize: 15 },
    offerDone: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 13, maxWidth: 90, textAlign: 'right' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: space(6),
      paddingBottom: space(10),
      gap: space(3),
      alignItems: 'flex-start',
    },
    sheetActions: { flexDirection: 'row', gap: space(3), alignSelf: 'stretch', marginTop: space(2) },
  }),
}));
