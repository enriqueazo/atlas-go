import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelDuel, declineDuel, duelDetail, myDuels, type DuelQuestion } from '@/cloud/duels';
import { failed } from '@/cloud/ranked';
import { Button, Chip, Screen } from '@/components/ui';
import { duelLink, durationLabel, isOpen, minutesLeft, type Duel } from '@/game/duels';
import { RANKED_ROUNDS } from '@/game/leagues';
import { BY_ISO } from '@/game/world';
import { useSettings } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const MODE_ICONS: Record<DuelQuestion['mode'], IconName> = {
  countries: 'earth',
  capitals: 'map-marker-star-outline',
  silhouette: 'shape-outline',
  flags: 'flag-variant-outline',
};

// One duel: where it stands, the button to play it, and once you have
// played, the questions one by one (your rival's answers show once it's over).
export default function DuelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const [duel, setDuel] = useState<Duel | null | undefined>(undefined);
  const [questions, setQuestions] = useState<DuelQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const all = await myDuels();
    if (failed(all)) {
      setError(all.error);
      return;
    }
    const d = all.find((x) => x.id === id) ?? null;
    setDuel(d);
    const detail = d ? await duelDetail(d.id) : [];
    if (!failed(detail)) setQuestions(detail);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/duels'));
  const decline = async () => {
    if (duel) await declineDuel(duel.id);
    load();
  };
  const cancel = async () => {
    if (duel) await cancelDuel(duel.id);
    back();
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.back} onPress={back} hitSlop={12}>
            <MaterialCommunityIcons name="chevron-left" size={30} color={colors.textMuted} />
          </Pressable>
          <Text style={styles.title}>{t.duelTitle}</Text>
        </View>
        {error ? (
          <Text style={styles.muted}>{t.cloudError(error)}</Text>
        ) : duel === undefined ? (
          <ActivityIndicator color={colors.purple} />
        ) : duel === null ? (
          <Text style={styles.muted}>{t.duelGone}</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Scoreboard duel={duel} />
            {duel.to_play && (
              <Button
                label={duel.me.started ? t.keepPlaying : t.playDuel(RANKED_ROUNDS)}
                onPress={() => router.push({ pathname: '/play-duel', params: { id: duel.id } })}
              />
            )}
            {duel.code && !duel.rival && (
              <View style={styles.card}>
                <Text style={styles.muted}>{t.shareCodeBody}</Text>
                <Text style={styles.code}>{duel.code}</Text>
                <Button
                  label={t.shareLink}
                  variant="ghost"
                  onPress={() =>
                    Share.share({ message: t.duelShare(duelLink(duel.code as string), duel.code as string) }).catch(
                      () => {},
                    )
                  }
                />
              </View>
            )}
            {isOpen(duel) && !duel.mine && !duel.me.started && duel.status === 'active' && (
              <Button label={t.declineDuel} variant="ghost" onPress={decline} />
            )}
            {duel.status === 'waiting' && duel.mine && !duel.me.started && (
              <Button label={t.cancelDuel} variant="ghost" onPress={cancel} />
            )}
            {questions.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.big}>{t.byQuestion}</Text>
                <View style={styles.head}>
                  <Text style={[styles.small, { flex: 1 }]}> </Text>
                  <Text style={[styles.small, styles.col]}>{t.youCol}</Text>
                  <Text style={[styles.small, styles.col]} numberOfLines={1}>
                    {duel.rival ?? t.rivalCol}
                  </Text>
                </View>
                {questions.map((q) => {
                  const place = BY_ISO.get(q.iso);
                  const name = place ? place[language] : q.iso;
                  return (
                    <View key={q.round} style={styles.questionRow}>
                      <MaterialCommunityIcons name={MODE_ICONS[q.mode]} size={18} color={colors.purpleSoft} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.place} numberOfLines={1}>
                          {q.mode === 'capitals' && place?.capital ? place.capital[language] : name}
                        </Text>
                        {q.mode === 'capitals' && <Text style={styles.small}>{name}</Text>}
                      </View>
                      <Mark answer={q.me} />
                      <Mark answer={q.them} hidden={!q.them && isOpen(duel)} />
                    </View>
                  );
                })}
                {isOpen(duel) && <Text style={styles.small}>{t.rivalHidden}</Text>}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Screen>
  );
}

function Scoreboard({ duel }: { duel: Duel }) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const tone = duel.result === 'won' ? colors.green : duel.result === 'lost' ? colors.wrong : colors.purpleSoft;
  const side = (name: string, correct: number | null, score: number | null, ms: number | null, played: boolean) => (
    <View style={styles.side}>
      <Text style={styles.sideName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.sideBig}>{correct ?? (played ? '✓' : '–')}</Text>
      <Text style={styles.small}>
        {score === null ? (played ? t.hasPlayed : t.notPlayed) : t.ptsTime(score, durationLabel(ms))}
      </Text>
    </View>
  );
  return (
    <View style={styles.card}>
      <Text style={[styles.status, { color: tone }]}>
        {t.duelStatus(duel, t.timeLeft(minutesLeft(duel, new Date())))}
      </Text>
      <View style={styles.versus}>
        {side(t.youCol, duel.me.correct, duel.me.score, duel.me.ms, duel.me.played)}
        <Text style={styles.vs}>vs</Text>
        {side(duel.rival ?? '¿?', duel.them.correct, duel.them.score, duel.them.ms, duel.them.played)}
      </View>
      {duel.result === 'won' && duel.me.score ? (
        <View style={{ alignItems: 'center' }}>
          <Chip label={t.leaguePoints(duel.me.score)} tone="green" />
        </View>
      ) : null}
    </View>
  );
}

function Mark({ answer, hidden = false }: { answer: { correct: boolean; points: number } | null; hidden?: boolean }) {
  const { colors, styles } = useThemed();
  if (hidden || !answer)
    return (
      <View style={styles.col}>
        <MaterialCommunityIcons name={hidden ? 'eye-off-outline' : 'minus'} size={20} color={colors.textMuted} />
      </View>
    );
  return (
    <View style={styles.col}>
      <MaterialCommunityIcons
        name={answer.correct ? 'check-circle' : 'close-circle'}
        size={22}
        color={answer.correct ? colors.green : colors.wrong}
      />
      {answer.correct && <Text style={styles.points}>+{answer.points}</Text>}
    </View>
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
    big: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18 },
    muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
    small: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 12 },
    status: { fontFamily: fonts.heavy, fontSize: 17, textAlign: 'center' },
    versus: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
    side: { flex: 1, alignItems: 'center', gap: space(1) },
    sideName: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
    sideBig: { color: colors.text, fontFamily: fonts.heavy, fontSize: 44, fontVariant: ['tabular-nums'] },
    vs: { color: colors.textMuted, fontFamily: fonts.heavy, fontSize: 16 },
    code: { color: colors.text, fontFamily: fonts.heavy, fontSize: 32, letterSpacing: 6, textAlign: 'center' },
    head: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
    questionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(2),
      paddingVertical: space(2),
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    place: { color: colors.text, fontFamily: fonts.heavy, fontSize: 16 },
    col: { width: 56, alignItems: 'center', textAlign: 'center' },
    points: { color: colors.green, fontFamily: fonts.bold, fontSize: 11 },
  }),
}));
