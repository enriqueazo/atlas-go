import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchProfile, getCachedProfile, type Profile } from '@/cloud/account';
import { createDuel, joinDuel, myDuels, randomDuel } from '@/cloud/duels';
import { failed } from '@/cloud/ranked';
import { Button, Chip, Screen } from '@/components/ui';
import { RANKED_DATA } from '@/data/ranked';
import { cleanCode, DUEL_HOURS, duelLink, isOpen, minutesLeft, type Duel } from '@/game/duels';
import { RANKED_ROUNDS } from '@/game/leagues';
import { useSettings } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

// Duels, as in Vocablo: start a duel (by name, a shared link or a random
// rival), and the list of your duels: the ones you have to play, the ones
// waiting on the rival, and the last finished ones.
export default function Duels() {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [duels, setDuels] = useState<Duel[] | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(() => {
    myDuels().then((d) => {
      setOffline(failed(d));
      if (!failed(d)) setDuels(d);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      getCachedProfile().then((p) => setProfile((current) => current ?? p ?? undefined));
      fetchProfile().then((p) => {
        setProfile(p);
        if (p) load();
      });
    }, [load]),
  );

  const toPlay = duels?.filter((d) => d.to_play) ?? [];
  const waiting = duels?.filter((d) => isOpen(d) && !d.to_play) ?? [];
  const finished = duels?.filter((d) => !isOpen(d)) ?? [];

  return (
    <Screen>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.back} onPress={() => goBack()} hitSlop={12}>
            <MaterialCommunityIcons name="chevron-left" size={30} color={colors.textMuted} />
          </Pressable>
          <Text style={styles.title}>{t.modeDuels}</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {profile === undefined ? (
            <ActivityIndicator color={colors.purple} />
          ) : profile === null ? (
            <NoProfile />
          ) : (
            <>
              <NewDuel onCreated={load} />
              {offline && !duels && (
                <View style={styles.card}>
                  <Text style={styles.muted}>{t.cloudError('offline')}</Text>
                </View>
              )}
              {!duels && !offline && <ActivityIndicator color={colors.purple} />}
              <List title={t.sectionToPlay} duels={toPlay} />
              <List title={t.sectionWaiting} duels={waiting} />
              <List title={t.sectionFinished} duels={finished} />
              {duels?.length === 0 && <Text style={styles.muted}>{t.duelsEmpty(RANKED_ROUNDS)}</Text>}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function NoProfile() {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  return (
    <View style={styles.card}>
      <MaterialCommunityIcons name="account-circle-outline" size={40} color={colors.purpleSoft} />
      <Text style={styles.big}>{t.createProfile}</Text>
      <Text style={styles.muted}>{t.cloudError('profile_required')}</Text>
      <Button label={t.goSettings} onPress={() => router.push('/settings')} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

/** The ways to start a duel. */
function NewDuel({ onCreated }: { onCreated: () => void }) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const run = async (step: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const error = await step();
    setBusy(false);
    if (error) setMessage({ text: t.duelError(error) ?? t.cloudError(error), error: true });
    onCreated();
  };

  const challenge = () =>
    run(async () => {
      const name = nickname.trim();
      if (!name) return null;
      const r = await createDuel(RANKED_DATA, name);
      if (failed(r)) return r.error;
      setNickname('');
      router.push(`/duels/${r.id}`);
      return null;
    });

  const shareLink = () =>
    run(async () => {
      const r = await createDuel(RANKED_DATA);
      if (failed(r)) return r.error;
      if (r.code) Share.share({ message: t.duelShare(duelLink(r.code), r.code) }).catch(() => {});
      router.push(`/duels/${r.id}`);
      return null;
    });

  const random = () =>
    run(async () => {
      const r = await randomDuel(RANKED_DATA);
      if (failed(r)) return r.error;
      if (r.matched) router.push(`/duels/${r.id}`);
      else setMessage({ text: t.lookingForRival, error: false });
      return null;
    });

  const join = () =>
    run(async () => {
      const c = cleanCode(code);
      if (!c) return 'duel_not_found';
      const r = await joinDuel(c);
      if (failed(r)) return r.error;
      setCode('');
      router.push(`/duels/${r.id}`);
      return null;
    });

  return (
    <View style={styles.card}>
      <Text style={styles.big}>{t.newDuel}</Text>
      <Text style={styles.muted}>{t.newDuelBody(RANKED_ROUNDS, DUEL_HOURS)}</Text>
      <Text style={styles.label}>{t.challengePlayer}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder={t.theirName}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          onSubmitEditing={challenge}
          accessibilityLabel={t.theirName}
          style={styles.input}
        />
        <Button label={t.challenge} onPress={challenge} />
      </View>
      <View style={styles.actions}>
        <Action icon="dice-5-outline" label={t.randomRival} onPress={random} />
        <Action icon="share-variant-outline" label={t.shareLink} onPress={shareLink} />
      </View>
      <Text style={styles.label}>{t.gotCode}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="K7MPQ2"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          onSubmitEditing={join}
          accessibilityLabel={t.gotCode}
          style={styles.input}
        />
        <Button label={t.joinGroup} variant="ghost" onPress={join} />
      </View>
      {busy && <ActivityIndicator color={colors.purple} />}
      {message && <Text style={[styles.message, message.error && { color: colors.wrong }]}>{message.text}</Text>}
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: 'dice-5-outline' | 'share-variant-outline';
  label: string;
  onPress: () => void;
}) {
  const { colors, styles } = useThemed();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.purpleSoft} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function List({ title, duels }: { title: string; duels: Duel[] }) {
  const { styles } = useThemed();
  if (duels.length === 0) return null;
  return (
    <View style={styles.list}>
      <Text style={styles.section}>{title}</Text>
      {duels.map((d) => (
        <DuelRow key={d.id} duel={d} />
      ))}
    </View>
  );
}

function DuelRow({ duel }: { duel: Duel }) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const tone =
    duel.result === 'won'
      ? colors.green
      : duel.result === 'lost'
        ? colors.wrong
        : duel.to_play
          ? colors.purpleSoft
          : colors.textMuted;
  const showScore = duel.me.played && duel.them.correct !== null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/duels/${duel.id}`)}
      style={({ pressed }) => [styles.row, duel.to_play && styles.rowToPlay, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={[styles.avatar, { borderColor: tone }]}>
        <MaterialCommunityIcons
          name={duel.kind === 'random' ? 'dice-5-outline' : duel.kind === 'link' ? 'link-variant' : 'sword-cross'}
          size={20}
          color={tone}
        />
      </View>
      <View style={{ flex: 1, gap: space(0.5) }}>
        <Text style={styles.rowTitle}>{duel.rival ?? (duel.kind === 'random' ? t.randomRival : t.linkDuel)}</Text>
        <Text style={[styles.rowStatus, { color: tone }]}>
          {t.duelStatus(duel, t.timeLeft(minutesLeft(duel, new Date())))}
        </Text>
        {duel.code && !duel.rival && (
          <View style={styles.codeRow}>
            <Chip label={t.codeChip(duel.code)} tone="purple" />
          </View>
        )}
      </View>
      {showScore ? (
        <Text style={[styles.score, { color: tone }]}>
          {duel.me.correct}–{duel.them.correct}
        </Text>
      ) : (
        <MaterialCommunityIcons name="chevron-right" size={26} color={colors.purpleSoft} />
      )}
    </Pressable>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(3) },
    title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 28 },
    body: { paddingBottom: space(10), gap: space(4) },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(5),
      gap: space(3),
    },
    big: { color: colors.text, fontFamily: fonts.heavy, fontSize: 20 },
    muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
    label: { color: colors.text, fontFamily: fonts.bold, fontSize: 15, marginTop: space(1) },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
    input: {
      flex: 1,
      flexBasis: 0,
      minWidth: 0,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space(3),
      paddingVertical: space(3),
      color: colors.text,
      fontFamily: fonts.regular,
      fontSize: 16,
    },
    actions: { flexDirection: 'row', gap: space(2) },
    action: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space(2),
      paddingVertical: space(3),
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.purpleDeep,
      backgroundColor: colors.tint,
    },
    actionLabel: { color: colors.purpleSoft, fontFamily: fonts.bold, fontSize: 15 },
    message: { color: colors.green, fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
    list: { gap: space(2) },
    section: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18, marginTop: space(2) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(3),
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(4),
    },
    rowToPlay: { borderColor: colors.purple },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { color: colors.text, fontFamily: fonts.heavy, fontSize: 16 },
    rowStatus: { fontFamily: fonts.bold, fontSize: 13 },
    codeRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(1) },
    score: { fontFamily: fonts.heavy, fontSize: 20, fontVariant: ['tabular-nums'] },
  }),
}));
