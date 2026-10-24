import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OptionCard, type OptionStatus } from '@/components/OptionCard';
import { tabBarStyle } from '@/components/tabBar';
import { Button, Chip, Screen } from '@/components/ui';
import { WorldMap } from '@/components/WorldMap';
import { levelFor, MAX_LEVEL, nextQuestion, optionLabel, PER_LEVEL, pointsFor, type Question } from '@/game/engine';
import { useSettings, type Mode } from '@/settings';
import { useSound } from '@/sounds';
import { fonts, radius, space, themed } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// One screen for the lobby and the game, so the map can zoom from the whole
// world into the first question and back out when you quit.
export default function Game() {
  const { colors, styles } = useThemed();
  const { t, language, records, saveRecord } = useSettings();
  const play = useSound();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [gained, setGained] = useState(0);
  const [isRecord, setIsRecord] = useState(false);
  const recent = useRef<string[]>([]);
  // Whether this run already passed the record, so the fanfare plays once.
  const celebrated = useRef(false);

  const playing = mode !== null && question !== null;

  // The tab bar steps aside while a game is on.
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: playing ? { display: 'none' } : tabBarStyle(colors, insets) });
  }, [navigation, playing, colors, insets]);

  useEffect(() => {
    if (!playing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      quit();
      return true;
    });
    return () => sub.remove();
  });

  const ask = (m: Mode, run: number) => {
    const q = nextQuestion(m, run, recent.current);
    recent.current = [...recent.current.slice(-40), q.target.iso];
    setQuestion(q);
    setPicked(null);
  };

  const start = (m: Mode) => {
    play('zoom');
    recent.current = [];
    setMode(m);
    setPoints(0);
    setStreak(0);
    setIsRecord(false);
    celebrated.current = false;
    ask(m, 0);
  };

  const quit = () => {
    setMode(null);
    setQuestion(null);
    setPicked(null);
  };

  const answer = (i: number) => {
    if (!question || !mode || picked !== null) return;
    setPicked(i);
    if (i === question.answer) {
      const pts = pointsFor(question);
      const total = points + pts;
      const beat = total > records[mode];
      const fanfare = beat && !celebrated.current && records[mode] > 0;
      if (beat) {
        celebrated.current = true;
        saveRecord(mode, total);
      }
      setGained(pts);
      setPoints(total);
      setStreak(streak + 1);
      setIsRecord(fanfare);
      play(fanfare ? 'record' : 'correct');
    } else {
      setPoints(0);
      setStreak(0);
      setIsRecord(false);
      celebrated.current = false;
      play('wrong');
    }
  };

  const next = () => {
    if (!mode) return;
    play('tap');
    ask(mode, streak);
  };

  const answered = picked !== null;
  const right = answered && picked === question?.answer;
  const status = !answered ? 'ask' : right ? 'right' : 'wrong';
  const modes: { id: Mode; icon: IconName; title: string; description: string }[] = [
    { id: 'countries', icon: 'earth', title: t.modeCountries, description: t.modeCountriesDesc },
    { id: 'capitals', icon: 'map-marker-star-outline', title: t.modeCapitals, description: t.modeCapitalsDesc },
  ];

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {playing ? (
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={quit} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
            <View style={styles.streak} accessibilityLabel={t.recordLabel(Math.max(records[mode], points))}>
              <MaterialCommunityIcons name="trophy-outline" size={20} color={colors.purpleSoft} />
              <Text style={styles.streakText}>{t.recordLabel(Math.max(records[mode], points))}</Text>
            </View>
            <Text style={styles.score} accessibilityLabel={`${t.points}: ${points}`}>
              {points}
            </Text>
          </View>
        ) : (
          <View style={styles.hero}>
            <View style={styles.logo}>
              <MaterialCommunityIcons name="earth" size={36} color={colors.onPurple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Atlas Go</Text>
              <Text style={styles.subtitle}>{t.tagline}</Text>
            </View>
          </View>
        )}

        <View style={styles.map}>
          <WorldMap focus={question?.target ?? null} mode={mode ?? 'countries'} status={status} />
        </View>

        {playing && question ? (
          <View style={styles.panel}>
            <Text style={styles.prompt}>{question.mode === 'countries' ? t.askCountry : t.askCapital}</Text>
            <View style={styles.options}>
              {question.options.map((o, i) => {
                let optionStatus: OptionStatus = 'idle';
                if (answered) {
                  if (i === question.answer) optionStatus = 'correct';
                  else if (i === picked) optionStatus = 'wrong';
                  else optionStatus = 'dimmed';
                }
                return (
                  <OptionCard
                    key={o.iso}
                    index={i}
                    text={optionLabel(question, o, language)}
                    status={optionStatus}
                    disabled={answered}
                    onPress={() => answer(i)}
                  />
                );
              })}
            </View>
            <Footer
              answered={answered}
              right={right}
              isRecord={isRecord}
              gained={gained}
              streak={streak}
              question={question}
              onNext={next}
            />
          </View>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.section}>{t.pickMode}</Text>
            {modes.map((m) => (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                onPress={() => start(m.id)}
                style={({ pressed }) => [styles.modeCard, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <View style={styles.modeIcon}>
                  <MaterialCommunityIcons name={m.icon} size={28} color={colors.text} />
                </View>
                <View style={styles.modeText}>
                  {records[m.id] > 0 && (
                    <View style={styles.chips}>
                      <Chip label={t.recordLabel(records[m.id])} tone="green" />
                    </View>
                  )}
                  <Text style={styles.modeTitle}>{m.title}</Text>
                  <Text style={styles.modeDescription}>{m.description}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={28} color={colors.purpleSoft} />
              </Pressable>
            ))}
          </View>
        )}
      </SafeAreaView>
    </Screen>
  );
}

/** Before an answer: progress to the next level. After: the verdict and Siguiente. */
function Footer({
  answered,
  right,
  isRecord,
  gained,
  streak,
  question,
  onNext,
}: {
  answered: boolean;
  right: boolean;
  isRecord: boolean;
  gained: number;
  streak: number;
  question: Question;
  onNext: () => void;
}) {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const pop = useRef(new Animated.Value(1)).current;

  // The answer footer pops in from 0.92 to full size.
  useEffect(() => {
    if (!answered) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [answered, pop]);

  if (!answered) {
    const level = levelFor(streak);
    const into = level >= MAX_LEVEL ? PER_LEVEL : streak % PER_LEVEL;
    return (
      <View style={styles.levelCard}>
        <View style={styles.levelRow}>
          <Text style={styles.levelText}>{t.level(level)}</Text>
          <Text style={styles.levelNote}>{level >= MAX_LEVEL ? t.maxLevel : t.toNext(PER_LEVEL - into)}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(into / PER_LEVEL) * 100}%` }]} />
        </View>
      </View>
    );
  }

  const target = question.target;
  const answerText = optionLabel(question, target, language);
  const detail = question.mode === 'capitals' ? target[language] : target.capital?.[language];

  return (
    <Animated.View
      style={[styles.footer, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}
    >
      <View>
        <Text style={[styles.verdict, { color: right ? colors.green : colors.wrong }]}>
          {right ? (isRecord ? t.newRecord : t.correct(gained)) : t.wrong}
        </Text>
        <Text style={styles.answer} numberOfLines={1}>
          {right ? answerText : t.itWas(answerText)}
          {detail ? ` · ${detail}` : ''}
        </Text>
      </View>
      <Button label={t.next} onPress={onNext} />
    </Animated.View>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    safe: { flex: 1 },
    hero: { flexDirection: 'row', alignItems: 'center', gap: space(4), paddingTop: space(6), paddingBottom: space(5) },
    logo: {
      width: 64,
      height: 64,
      borderRadius: 22,
      backgroundColor: colors.purple,
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '-6deg' }],
      shadowColor: colors.purple,
      shadowOpacity: 0.5,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 32 },
    subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15 },
    header: { flexDirection: 'row', alignItems: 'center', gap: space(4), paddingVertical: space(3) },
    close: { color: colors.textMuted, fontSize: 20, fontFamily: fonts.bold },
    streak: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(1) },
    streakText: { color: colors.purpleSoft, fontFamily: fonts.heavy, fontSize: 17 },
    score: {
      color: colors.green,
      fontFamily: fonts.heavy,
      fontSize: 20,
      minWidth: 48,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    map: { flex: 1, minHeight: 180 },
    panel: { paddingTop: space(5), paddingBottom: space(5), gap: space(3) },
    section: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 15, marginBottom: space(1) },
    modeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(4),
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(5),
      marginBottom: space(1),
    },
    modeIcon: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      backgroundColor: colors.purpleDeep,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeText: { flex: 1, gap: space(1) },
    chips: { flexDirection: 'row', gap: space(2), marginBottom: space(1) },
    modeTitle: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18 },
    modeDescription: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
    prompt: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
    options: { gap: space(3) },
    levelCard: {
      marginTop: space(1),
      gap: space(3),
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(5),
    },
    levelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space(3) },
    levelText: { color: colors.purpleSoft, fontFamily: fonts.heavy, fontSize: 17 },
    levelNote: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14 },
    progressTrack: { height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.purple },
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
  }),
}));
