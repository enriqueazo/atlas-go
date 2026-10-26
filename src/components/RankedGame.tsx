import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { failed, rankedAnswer, rankedNext, type RankedGame as Game, type RankedQuestion, type Result } from '@/cloud/ranked';
import { optionLabel, type Question } from '@/game/engine';
import { trackAnswer } from '@/game/stats';
import { BY_ISO } from '@/game/world';
import { useSettings } from '@/settings';
import { useSound } from '@/sounds';
import { fonts, radius, space, themed } from '@/theme';

import { Flag } from './Flag';
import { OptionCard, type OptionStatus } from './OptionCard';
import { Silhouette } from './Silhouette';
import { Button, Screen } from './ui';
import { WorldMap } from './WorldMap';

type Asked = { question: Question; round: number; level: number; deadline: number };
type Verdict = { picked: number | null; right: boolean; points: number };
export type Finished = { score: number; correct: number; played: number; cut: boolean };

/**
 * A game run by the server, for Ranked and duels: it sends each question and
 * scores each answer, and the app draws them with the quiz modes' map, flags
 * and silhouettes, against the clock. `start` begins the game; `results` is
 * shown under the score at the end.
 */
export function RankedGame({
  title,
  icon,
  start,
  results,
  problem,
}: {
  title: string;
  icon: 'trophy-outline' | 'sword-cross';
  start: () => Promise<Result<Game>>;
  results: (f: Finished) => ReactNode;
  /** Shown instead of the game when it can't start, with the server's error code. */
  problem: (code: string) => ReactNode;
}) {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const play = useSound();
  const game = useRef<Game | null>(null);
  // Calls to the server go one after another, so an answer always arrives
  // before the next question is asked for.
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [cut, setCut] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [onMap, setOnMap] = useState(false);

  const queue = (step: () => Promise<unknown>) => {
    pending.current = pending.current.then(step);
  };

  const show = useCallback((q: RankedQuestion) => {
    if (q.done) {
      setFinished({ score: q.score, correct: q.correct, played: q.played, cut: false });
      setAsked(null);
      return;
    }
    const target = BY_ISO.get(q.iso);
    const options = q.options.map((iso) => BY_ISO.get(iso));
    if (!target || options.some((o) => !o)) {
      setCut(true);
      return;
    }
    setAsked({
      question: { mode: q.mode, target, options: options as Question['options'], answer: q.options.indexOf(q.iso) },
      round: q.round,
      level: q.level,
      deadline: Date.now() + q.ms_left,
    });
    setVerdict(null);
  }, []);

  const next = useCallback(async () => {
    await pending.current;
    const id = game.current?.id;
    if (!id) return;
    const q = await rankedNext(id);
    if (failed(q)) setCut(true);
    else show(q);
  }, [show]);

  useEffect(() => {
    let live = true;
    start().then((g) => {
      if (!live) return;
      if (failed(g)) {
        setError(g.error);
        return;
      }
      game.current = g;
      play('zoom');
      next();
    });
    return () => {
      live = false;
    };
    // Starts once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A lost connection ends the game where it stands.
  useEffect(() => {
    if (cut && !finished) setFinished({ score, correct, played: asked?.round ?? 0, cut: true });
  }, [cut, finished, score, correct, asked]);

  const answer = useCallback(
    (picked: number | null) => {
      const id = game.current?.id;
      if (!asked || verdict || !id) return;
      const q = asked.question;
      // The app already knows the place it drew, so the verdict shows at once;
      // the server's points and score follow.
      const right = picked === q.answer;
      setVerdict({ picked, right, points: right ? q.target.tier * 10 : 0 });
      play(right ? 'correct' : 'wrong');
      trackAnswer({ mode: q.mode, iso: q.target.iso, correct: right });
      queue(async () => {
        const r = await rankedAnswer(id, picked === null ? null : q.options[picked].iso);
        if (failed(r)) {
          setCut(true);
          return;
        }
        setScore(r.score);
        if (r.correct) setCorrect((n) => n + 1);
        setVerdict((v) => (v ? { ...v, right: r.correct, points: r.points } : v));
      });
    },
    [asked, verdict, play],
  );

  // The clock: ticks while a question is open and answers for the player when it runs out.
  useEffect(() => {
    if (!asked || verdict) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= asked.deadline) answer(null);
    }, 200);
    return () => clearInterval(id);
  }, [asked, verdict, answer]);

  const quit = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      quit();
      return true;
    });
    return () => sub.remove();
  }, [quit]);

  const rounds = game.current?.rounds ?? 10;
  const seconds = game.current?.seconds ?? 30;

  if (error) return <Screen>{problem(error)}</Screen>;

  if (finished) {
    return (
      <Screen>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.done} showsVerticalScrollIndicator={false}>
            <MaterialCommunityIcons name={icon} size={56} color={colors.purpleSoft} />
            <Text style={styles.doneTitle}>{title}</Text>
            <Text style={styles.doneScore}>{finished.score}</Text>
            <Text style={styles.muted}>{t.dailyScore(finished.correct, rounds, finished.score)}</Text>
            {finished.cut && <Text style={styles.cut}>{t.connectionLost}</Text>}
            {results(finished)}
          </ScrollView>
        </SafeAreaView>
      </Screen>
    );
  }

  if (!asked) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.purple} size="large" />
        </View>
      </Screen>
    );
  }

  const q = asked.question;
  const answered = verdict !== null;
  const left = Math.max(0, asked.deadline - now);
  const cover = (q.mode === 'silhouette' || q.mode === 'flags') && !answered;
  const prompt =
    q.mode === 'capitals' ? t.askCapital : q.mode === 'silhouette' ? t.askSilhouette : q.mode === 'flags' ? t.askFlag : t.askCountry;
  const answerText = optionLabel(q, q.target, language);
  const detail = q.mode === 'capitals' ? q.target[language] : q.target.capital?.[language];
  const last = asked.round + 1 >= rounds;

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          scrollEnabled={!onMap}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={quit} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
            <View style={styles.title}>
              <MaterialCommunityIcons name={icon} size={20} color={colors.purpleSoft} />
              <Text style={styles.titleText} numberOfLines={1}>
                {t.dailyRound(asked.round + 1, rounds)}
              </Text>
            </View>
            <Text style={styles.score} accessibilityLabel={`${t.points}: ${score}`}>
              {score}
            </Text>
          </View>
          <View style={styles.clockTrack} accessibilityLabel={`${Math.ceil(left / 1000)} s`}>
            <View
              style={[
                styles.clockFill,
                { width: `${(left / (seconds * 1000)) * 100}%` },
                left < 5000 && { backgroundColor: colors.wrong },
              ]}
            />
          </View>

          <View style={styles.map}>
            <WorldMap
              focus={cover ? null : q.target}
              mode={q.mode === 'capitals' ? 'capitals' : 'countries'}
              status={!answered ? 'ask' : verdict.right ? 'right' : 'wrong'}
              onGesture={setOnMap}
            />
            {cover && (
              <View style={styles.cover} accessibilityLabel={prompt}>
                {q.mode === 'flags' ? (
                  <Flag iso={q.target.iso} width="86%" />
                ) : (
                  <Silhouette iso={q.target.iso} color={colors.purple} size="80%" />
                )}
              </View>
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.prompt}>{prompt}</Text>
            <View style={styles.options}>
              {q.options.map((o, i) => {
                let status: OptionStatus = 'idle';
                if (answered) status = i === q.answer ? 'correct' : i === verdict.picked ? 'wrong' : 'dimmed';
                return (
                  <OptionCard
                    key={o.iso}
                    index={i}
                    text={optionLabel(q, o, language)}
                    status={status}
                    disabled={answered}
                    onPress={() => answer(i)}
                  />
                );
              })}
            </View>
            {answered && (
              <View style={styles.footer}>
                <View>
                  <Text style={[styles.verdict, { color: verdict.right ? colors.green : colors.wrong }]}>
                    {verdict.right ? t.correct(verdict.points) : verdict.picked === null ? t.timeUp : t.dailyWrong}
                  </Text>
                  <Text style={styles.answer} numberOfLines={1}>
                    {verdict.right ? answerText : t.itWas(answerText)}
                    {detail ? ` · ${detail}` : ''}
                  </Text>
                </View>
                <Button
                  label={last ? t.seeResult : t.next}
                  onPress={() => {
                    play('tap');
                    next();
                  }}
                />
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

/** Why the game can't start: no profile yet, an old app, or no connection. */
export function GameProblem({ code, title }: { code: string; title: string }) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const profile = code === 'profile_required';
  return (
    <View style={styles.problem}>
      <MaterialCommunityIcons
        name={profile ? 'account-circle-outline' : 'cloud-off-outline'}
        size={56}
        color={colors.purpleSoft}
      />
      <Text style={styles.doneTitle}>{profile ? t.createProfile : title}</Text>
      <Text style={[styles.muted, { textAlign: 'center' }]}>{t.cloudError(code)}</Text>
      {profile ? (
        <Button label={t.goSettings} onPress={() => router.replace('/settings')} />
      ) : (
        <Button label={t.back} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      )}
    </View>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    safe: { flex: 1 },
    content: { flexGrow: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', gap: space(4), paddingVertical: space(3) },
    close: { color: colors.textMuted, fontSize: 20, fontFamily: fonts.bold },
    title: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(1) },
    titleText: { color: colors.purpleSoft, fontFamily: fonts.heavy, fontSize: 17 },
    score: {
      color: colors.green,
      fontFamily: fonts.heavy,
      fontSize: 20,
      minWidth: 48,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    clockTrack: {
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
      overflow: 'hidden',
      marginBottom: space(3),
    },
    clockFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.purple },
    map: { flex: 1, minHeight: 180 },
    cover: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    panel: { paddingTop: space(5), paddingBottom: space(5), gap: space(3) },
    prompt: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
    options: { gap: space(3) },
    footer: {
      marginTop: space(1),
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      padding: space(5),
      gap: space(4),
      borderWidth: 1,
      borderColor: colors.border,
    },
    verdict: { fontFamily: fonts.heavy, fontSize: 20, textAlign: 'center' },
    answer: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', marginTop: space(1) },
    done: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space(3), paddingVertical: space(8) },
    doneTitle: { color: colors.text, fontFamily: fonts.heavy, fontSize: 24, textAlign: 'center' },
    doneScore: { color: colors.green, fontFamily: fonts.heavy, fontSize: 56, fontVariant: ['tabular-nums'] },
    muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
    cut: { color: colors.wrong, fontFamily: fonts.bold, fontSize: 14, textAlign: 'center' },
    problem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(3), paddingHorizontal: space(4) },
  }),
}));
