import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Pressable, Text, View } from 'react-native';

import { Button, Chip, Logo, ModeCard, OptionCard, Screen, type OptionState } from '@/components/ui';
import { WorldMap } from '@/components/WorldMap';
import { levelFor, MAX_LEVEL, nextQuestion, optionLabel, PER_LEVEL, pointsFor, type Question } from '@/game/engine';
import { useSettings, type Mode } from '@/settings';
import { useSound } from '@/sounds';
import { radius, space, tabBarStyle, themed, type, useTheme } from '@/theme';

const BADGES = ['A', 'B', 'C'];

export default function GameScreen() {
  const s = useStyles();
  const { c } = useTheme();
  const { t, language, records, saveRecord } = useSettings();
  const play = useSound();
  const navigation = useNavigation();

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
    navigation.setOptions({ tabBarStyle: playing ? { display: 'none' } : tabBarStyle(c) });
  }, [navigation, playing, c]);

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
      setGained(pts);
      setPoints(total);
      setStreak(streak + 1);
      const fanfare = beat && !celebrated.current && records[mode] > 0;
      if (beat) {
        celebrated.current = true;
        saveRecord(mode, total);
      }
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
  const level = levelFor(streak);
  const status = !answered ? 'ask' : right ? 'right' : 'wrong';

  return (
    <Screen>
      {playing ? (
        <View style={s.gameHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={quit} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={26} color={c.textMuted} />
          </Pressable>
          <View style={s.headerMid}>
            <Chip label={t.level(level)} tone="purple" icon="signal-cellular-3" />
            <Chip label={`${t.record} ${records[mode]}`} icon="trophy-outline" />
          </View>
          <Text style={s.score} accessibilityLabel={`${t.points}: ${points}`}>
            {points}
          </Text>
        </View>
      ) : (
        <View style={s.lobbyHeader}>
          <Logo size={56} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Atlas Go</Text>
            <Text style={s.tagline}>{t.tagline}</Text>
          </View>
        </View>
      )}

      <View style={s.mapWrap}>
        <WorldMap focus={question?.target ?? null} mode={mode ?? 'countries'} status={status} />
      </View>

      {playing && question ? (
        <View style={s.panel}>
          <Text style={s.prompt}>{question.mode === 'countries' ? t.askCountry : t.askCapital}</Text>
          <View style={s.options}>
            {question.options.map((o, i) => {
              let state: OptionState = 'idle';
              if (answered) {
                if (i === question.answer) state = 'correct';
                else if (i === picked) state = 'wrong';
                else state = 'dimmed';
              }
              return (
                <OptionCard
                  key={o.iso}
                  badge={BADGES[i]}
                  label={optionLabel(question, o, language)}
                  state={state}
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
        <View style={s.panel}>
          <Text style={s.prompt}>{t.pickMode}</Text>
          <View style={s.modes}>
            <ModeCard
              icon="earth"
              title={t.modeCountries}
              description={t.modeCountriesDesc}
              footer={<Chip label={`${t.record} ${records.countries}`} tone="green" icon="trophy-outline" />}
              onPress={() => start('countries')}
            />
            <ModeCard
              icon="map-marker-star-outline"
              title={t.modeCapitals}
              description={t.modeCapitalsDesc}
              footer={<Chip label={`${t.record} ${records.capitals}`} tone="green" icon="trophy-outline" />}
              onPress={() => start('capitals')}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

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
  const s = useStyles();
  const { c } = useTheme();
  const { t, language } = useSettings();
  const pop = useRef(new Animated.Value(1)).current;

  // The answer footer pops in from 0.92 to full size.
  useEffect(() => {
    if (!answered) return;
    pop.setValue(0.92);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [answered, pop]);

  if (!answered) {
    const level = levelFor(streak);
    const into = level >= MAX_LEVEL ? PER_LEVEL : streak % PER_LEVEL;
    return (
      <View style={s.footer}>
        <View style={s.progressRow}>
          {Array.from({ length: PER_LEVEL }, (_, i) => (
            <View key={i} style={[s.progressDot, i < into && { backgroundColor: c.purple }]} />
          ))}
        </View>
        <Text style={s.footerNote}>{level >= MAX_LEVEL ? t.maxLevel : t.toNext(PER_LEVEL - into)}</Text>
      </View>
    );
  }

  const target = question.target;
  const answerText = optionLabel(question, target, language);
  const detail = question.mode === 'capitals' ? target[language] : target.capital?.[language];
  const verdict = right ? (isRecord ? t.newRecord : t.correct(gained)) : t.wrong;

  return (
    <Animated.View style={[s.footer, s.footerAnswered, { transform: [{ scale: pop }] }]}>
      <View style={{ flex: 1 }}>
        <Text style={[type.verdict, { color: right ? c.green : c.wrong }]}>
          {right ? '✓ ' : '✕ '}
          {verdict}
        </Text>
        <Text style={s.footerNote} numberOfLines={2}>
          {right ? answerText : t.itWas(answerText)}
          {detail ? ` · ${detail}` : ''}
        </Text>
      </View>
      <Button label={t.next} onPress={onNext} compact />
    </Animated.View>
  );
}

const useStyles = themed((c) => ({
  lobbyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(4),
    paddingTop: space(4),
    paddingBottom: space(5),
  },
  title: { ...type.title, color: c.text },
  tagline: { ...type.body, color: c.textMuted },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(4),
    paddingVertical: space(3),
  },
  headerMid: { flex: 1, flexDirection: 'row', gap: space(2), justifyContent: 'center' },
  score: {
    ...type.verdict,
    minWidth: 48,
    textAlign: 'right',
    color: c.green,
    fontVariant: ['tabular-nums'],
  },
  mapWrap: { flex: 1, minHeight: 180 },
  panel: { paddingTop: space(5), paddingBottom: space(5), gap: space(3) },
  prompt: { ...type.label, color: c.textMuted },
  modes: { gap: space(4) },
  options: { gap: space(3) },
  footer: {
    marginTop: space(1),
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(4),
    paddingHorizontal: space(5),
    paddingVertical: space(3),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  footerAnswered: { backgroundColor: c.surfaceRaised },
  footerNote: { ...type.small, color: c.textMuted },
  progressRow: { flex: 1, flexDirection: 'row', gap: space(2) },
  progressDot: {
    flex: 1,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceRaised,
  },
}));
