import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, Share, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OptionCard, type OptionStatus } from '@/components/OptionCard';
import { Flag } from '@/components/Flag';
import { Silhouette } from '@/components/Silhouette';
import { tabBarStyle } from '@/components/tabBar';
import { Button, Chip, Screen } from '@/components/ui';
import { WorldMap } from '@/components/WorldMap';
import { formatTime, WORLD_BOARD, type Board } from '@/game/complete';
import { COUNTRY_MAPS, countryBoard, type CountryMap } from '@/game/countries';
import {
  currentStreak,
  DAILY_ROUNDS,
  dailyLevel,
  dailyQuestions,
  EMPTY_DAILY,
  getDaily,
  pick,
  picksFor,
  saveDaily,
  scoreDay,
  squares,
  type DailyRecord,
  type DailyScore,
} from '@/game/daily';
import { levelFor, MAX_LEVEL, nextQuestion, optionLabel, PER_LEVEL, pointsFor, type Question } from '@/game/engine';
import { loadSaved, useBoardProgress } from '@/game/progress';
import { dayKey, trackAnswer, trackDaily, trackRun } from '@/game/stats';
import { useCompleteGame } from '@/game/useCompleteGame';
import { LIVES, useNeighboursGame } from '@/game/useNeighboursGame';
import { BY_ISO } from '@/game/world';
import { useSettings, type Mode } from '@/settings';
import { useSound } from '@/sounds';
import { fonts, radius, space, themed } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
/**
 * The quiz modes keep a record; Complete the map keeps its progress instead,
 * Complete a country keeps one per country, and the map of the day a streak.
 */
type Play = Mode | 'complete' | 'country' | 'daily';
/** What the country list shows for each country: how far along, and the record. */
type Summary = { filled: number; best: number | null };

// One screen for the lobby and the game, so the map can zoom from the whole
// world into the first question and back out when you quit.
export default function Game() {
  const { colors, styles } = useThemed();
  const { t, language, records, saveRecord } = useSettings();
  const play = useSound();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Play | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [gained, setGained] = useState(0);
  const [isRecord, setIsRecord] = useState(false);
  const recent = useRef<string[]>([]);
  // Whether this run already passed the record, so the fanfare plays once.
  const celebrated = useRef(false);
  // Each run is saved under its own id as it grows, for the Ranking tab.
  const runId = useRef(0);
  const scroll = useRef<ScrollViewInstance>(null);
  // The page holds still while a finger moves the map.
  const [onMap, setOnMap] = useState(false);
  const progress = useBoardProgress(WORLD_BOARD);
  const complete = useCompleteGame(WORLD_BOARD, progress, play);
  // Complete a country: the country picked, and its own map and progress.
  const [country, setCountry] = useState<CountryMap | null>(null);
  const [countryMap, setCountryMap] = useState<Board>(() => countryBoard(COUNTRY_MAPS[0].iso));
  const countryProgress = useBoardProgress(countryMap);
  const countryGame = useCompleteGame(countryMap, countryProgress, play);
  // A country was picked; the game starts once its progress has loaded.
  const [starting, setStarting] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const neighbours = useNeighboursGame(play);
  // Map of the day: the saved picks and streak, and the day being played, so
  // a game that runs past midnight stays on its day.
  const [daily, setDaily] = useState<DailyRecord>(EMPTY_DAILY);
  const [day, setDay] = useState(() => dayKey(new Date()));

  const picking = mode === 'country' && !country;
  const painting = mode === 'complete' || (mode === 'country' && !!country);
  const board = mode === 'country' ? countryMap : WORLD_BOARD;
  const boardProgress = mode === 'country' ? countryProgress : progress;
  const game = mode === 'country' ? countryGame : complete;
  // Countries, Capitals, Silhouettes or Flags, the quiz modes.
  const quiz =
    mode === 'countries' || mode === 'capitals' || mode === 'silhouette' || mode === 'flags' ? mode : null;
  const isDaily = mode === 'daily';
  const isNeighbours = mode === 'neighbours';
  const playing = painting || picking || isDaily || isNeighbours || (quiz !== null && question !== null);
  const dayPicks = picksFor(daily, day);

  // The map of the day's progress, for the lobby card.
  useEffect(() => {
    if (mode !== null) return;
    let live = true;
    setDay(dayKey(new Date()));
    getDaily().then((r) => live && setDaily(r));
    return () => {
      live = false;
    };
  }, [mode]);

  // Every country's progress and record, for the lobby and the country list.
  useEffect(() => {
    if (mode !== null && !picking) return;
    let live = true;
    Promise.all(COUNTRY_MAPS.map((m) => loadSaved(m.id))).then((all) => {
      if (!live) return;
      setSummaries(
        Object.fromEntries(all.map((s, i) => [COUNTRY_MAPS[i].id, { filled: s.filled.length, best: s.best }])),
      );
    });
    return () => {
      live = false;
    };
  }, [mode, picking]);

  useEffect(() => {
    if (!starting || !countryProgress.ready) return;
    setStarting(false);
    countryGame.start();
  }, [starting, countryProgress.ready]);

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

  const start = (m: Play) => {
    play('zoom');
    scroll.current?.scrollTo({ y: 0, animated: false });
    if (m === 'complete') {
      setMode(m);
      complete.start();
      return;
    }
    if (m === 'country') {
      setMode(m);
      setCountry(null);
      return;
    }
    if (m === 'neighbours') {
      setMode(m);
      neighbours.start();
      return;
    }
    if (m === 'daily') {
      // Picks up where the player left off, or shows the result once done.
      const today = dayKey(new Date());
      const done = picksFor(daily, today);
      setDay(today);
      setMode(m);
      setPoints(scoreDay(today, done).points);
      setIsRecord(false);
      setQuestion(done.length < DAILY_ROUNDS ? dailyQuestions(today)[done.length] : null);
      setPicked(null);
      return;
    }
    recent.current = [];
    setMode(m);
    setPoints(0);
    setStreak(0);
    setIsRecord(false);
    celebrated.current = false;
    runId.current = Date.now();
    ask(m, 0);
  };

  const pickCountry = (m: CountryMap) => {
    play('zoom');
    scroll.current?.scrollTo({ y: 0, animated: false });
    setCountryMap(countryBoard(m.iso));
    setCountry(m);
    setStarting(true);
  };

  const quit = () => {
    if (painting) game.stop();
    // Leaving a country's map goes back to the list of countries.
    if (mode === 'country' && country) {
      setStarting(false);
      setCountry(null);
      return;
    }
    setMode(null);
    setQuestion(null);
    setPicked(null);
  };

  const answerDaily = (i: number) => {
    if (!question || picked !== null) return;
    const right = i === question.answer;
    const after = pick(daily, day, i);
    setPicked(i);
    setDaily(after);
    saveDaily(after);
    trackAnswer({ mode: question.mode, iso: question.target.iso, correct: right });
    if (right) {
      setGained(pointsFor(question));
      setPoints(points + pointsFor(question));
    }
    play(right ? 'correct' : 'wrong');
    if (after.picks.length === DAILY_ROUNDS) {
      const score = scoreDay(day, after.picks);
      trackDaily({ day, points: score.points, correct: score.correct, at: Date.now() });
    }
  };

  const answer = (i: number) => {
    if (isDaily) return answerDaily(i);
    if (!question || !quiz || picked !== null) return;
    setPicked(i);
    trackAnswer({ mode: quiz, iso: question.target.iso, correct: i === question.answer });
    if (i === question.answer) {
      const pts = pointsFor(question);
      const total = points + pts;
      const beat = total > records[quiz];
      const fanfare = beat && !celebrated.current && records[quiz] > 0;
      if (beat) {
        celebrated.current = true;
        saveRecord(quiz, total);
      }
      setGained(pts);
      setPoints(total);
      setStreak(streak + 1);
      trackRun(quiz, { id: runId.current, points: total, streak: streak + 1, at: Date.now() });
      setIsRecord(fanfare);
      play(fanfare ? 'record' : 'correct');
    } else {
      setPoints(0);
      setStreak(0);
      setIsRecord(false);
      celebrated.current = false;
      // A miss ends the run; the next answer starts a new one.
      runId.current = Date.now();
      play('wrong');
    }
  };

  const next = () => {
    if (isDaily) {
      const n = dayPicks.length;
      play(n < DAILY_ROUNDS ? 'tap' : 'record');
      setQuestion(n < DAILY_ROUNDS ? dailyQuestions(day)[n] : null);
      setPicked(null);
      return;
    }
    if (!quiz) return;
    play('tap');
    ask(quiz, streak);
  };

  const answered = picked !== null;
  const right = answered && picked === question?.answer;
  const status = !answered ? 'ask' : right ? 'right' : 'wrong';
  const prompt = (q: Question) =>
    q.mode === 'capitals'
      ? t.askCapital
      : q.mode === 'silhouette'
        ? t.askSilhouette
        : q.mode === 'flags'
          ? t.askFlag
          : t.askCountry;
  // A silhouette or a flag hides the map until it is answered, then the map shows where it is.
  const cover = (question?.mode === 'silhouette' || question?.mode === 'flags') && !answered ? question : null;
  const today = scoreDay(day, dayPicks);
  const shownPoints = isNeighbours ? neighbours.points : points;
  const recordMode: Mode = isNeighbours ? 'neighbours' : (quiz ?? 'countries');
  const dayStreak = currentStreak(daily, day);
  const modes: { id: Play; icon: IconName; title: string; description: string; chip: string | null }[] = [
    {
      id: 'daily',
      icon: 'calendar-star',
      title: t.modeDaily,
      description: t.modeDailyDesc(DAILY_ROUNDS),
      chip:
        [
          dayPicks.length === DAILY_ROUNDS
            ? t.dailyToday(today.correct, DAILY_ROUNDS)
            : dayPicks.length > 0
              ? t.dailyGoing(dayPicks.length, DAILY_ROUNDS)
              : null,
          dayStreak > 0 ? t.dailyStreakChip(dayStreak) : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    },
    {
      id: 'countries',
      icon: 'earth',
      title: t.modeCountries,
      description: t.modeCountriesDesc,
      chip: records.countries > 0 ? t.recordLabel(records.countries) : null,
    },
    {
      id: 'capitals',
      icon: 'map-marker-star-outline',
      title: t.modeCapitals,
      description: t.modeCapitalsDesc,
      chip: records.capitals > 0 ? t.recordLabel(records.capitals) : null,
    },
    {
      id: 'silhouette',
      icon: 'shape-outline',
      title: t.modeSilhouette,
      description: t.modeSilhouetteDesc,
      chip: records.silhouette > 0 ? t.recordLabel(records.silhouette) : null,
    },
    {
      id: 'flags',
      icon: 'flag-variant-outline',
      title: t.modeFlags,
      description: t.modeFlagsDesc,
      chip: records.flags > 0 ? t.recordLabel(records.flags) : null,
    },
    {
      id: 'neighbours',
      icon: 'map-marker-path',
      title: t.modeNeighbours,
      description: t.modeNeighboursDesc(LIVES),
      chip: records.neighbours > 0 ? t.recordLabel(records.neighbours) : null,
    },
    {
      id: 'complete',
      icon: 'map-check-outline',
      title: t.modeComplete,
      description: t.modeCompleteDesc,
      chip:
        [
          progress.filled.size > 0 && progress.filled.size < progress.total
            ? t.filledOf(progress.filled.size, progress.total)
            : null,
          progress.best !== null ? t.bestTime(formatTime(progress.best)) : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    },
    {
      id: 'country',
      icon: 'map-legend',
      title: t.modeCountry,
      description: t.modeCountryDesc,
      chip: (() => {
        const n = Object.values(summaries).filter((x) => x.best !== null).length;
        return n > 0 ? t.countryRecords(n) : null;
      })(),
    },
  ];
  const unit = country ? country.unit[language] : '';

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Scrolls when the lobby is taller than the screen; dragging the map
            still moves the map. */}
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          scrollEnabled={!onMap}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
        {picking ? (
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={quit} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
            <Text style={[styles.streakText, styles.headerTitle]}>{t.pickCountry}</Text>
          </View>
        ) : painting ? (
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={quit} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
            <View
              style={styles.streak}
              accessibilityLabel={
                country
                  ? t.regionsFilledLabel(boardProgress.filled.size, boardProgress.total, unit)
                  : t.filledLabel(boardProgress.filled.size, boardProgress.total)
              }
            >
              <MaterialCommunityIcons name="map-check-outline" size={20} color={colors.purpleSoft} />
              <Text style={styles.streakText} numberOfLines={1}>
                {country ? `${country[language]} · ` : ''}
                {t.filledOf(boardProgress.filled.size, boardProgress.total)}
              </Text>
            </View>
            <Clock time={game.elapsed} running={game.running} />
          </View>
        ) : isDaily ? (
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={quit} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
            <View style={styles.streak}>
              <MaterialCommunityIcons name="calendar-star" size={20} color={colors.purpleSoft} />
              <Text style={styles.streakText} numberOfLines={1}>
                {t.modeDaily}
              </Text>
            </View>
            <Text style={styles.score} accessibilityLabel={`${t.points}: ${points}`}>
              {points}
            </Text>
          </View>
        ) : playing ? (
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={quit} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
            <View style={styles.streak} accessibilityLabel={t.recordLabel(Math.max(records[recordMode], shownPoints))}>
              <MaterialCommunityIcons name="trophy-outline" size={20} color={colors.purpleSoft} />
              <Text style={styles.streakText}>{t.recordLabel(Math.max(records[recordMode], shownPoints))}</Text>
            </View>
            <Text style={styles.score} accessibilityLabel={`${t.points}: ${shownPoints}`}>
              {shownPoints}
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

        {picking ? (
          <CountryList summaries={summaries} onPick={pickCountry} />
        ) : (
        <View style={styles.map}>
          {painting ? (
            <WorldMap
              board={board}
              focus={game.revealed ? game.target : null}
              mode="countries"
              status="ask"
              paint={{ filled: boardProgress.filled, flash: game.flash }}
              onTap={game.tap}
              onGesture={setOnMap}
            />
          ) : isNeighbours ? (
            <WorldMap
              focus={neighbours.target}
              mode="countries"
              status="ask"
              marks={{ marks: neighbours.marks, flash: neighbours.flash }}
              onTap={neighbours.tap}
              onGesture={setOnMap}
            />
          ) : (
            <WorldMap
              focus={cover ? null : (question?.target ?? null)}
              mode={question?.mode === 'capitals' ? 'capitals' : 'countries'}
              status={status}
              onGesture={setOnMap}
            />
          )}
          {cover && (
            <View style={styles.cover} accessibilityLabel={prompt(cover)}>
              {cover.mode === 'flags' ? (
                <Flag iso={cover.target.iso} width="86%" />
              ) : (
                <Silhouette iso={cover.target.iso} color={colors.purple} size="80%" />
              )}
            </View>
          )}
        </View>
        )}

        {picking ? null : painting ? (
          <CompletePanel
            game={game}
            board={board}
            country={country}
            filled={boardProgress.filled.size}
            total={boardProgress.total}
            misses={boardProgress.misses}
            best={boardProgress.best}
          />
        ) : isNeighbours ? (
          <NeighboursPanel game={neighbours} />
        ) : isDaily && !question ? (
          <DailyPanel day={day} score={today} streak={dayStreak} />
        ) : playing && question ? (
          <View style={styles.panel}>
            <Text style={styles.prompt}>
              {prompt(question)}
            </Text>
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
              round={isDaily ? { n: dayPicks.length - (answered ? 1 : 0), total: DAILY_ROUNDS } : null}
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
                  {m.chip && (
                    <View style={styles.chips}>
                      <Chip label={m.chip} tone={m.id === 'complete' || m.id === 'country' || m.id === 'daily' ? 'purple' : 'green'} />
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
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

/** The clock for Complete the map, ticking while it runs. */
function Clock({ time, running }: { time: () => number; running: boolean }) {
  const { styles } = useThemed();
  const { t } = useSettings();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [running]);
  const shown = formatTime(time());
  return (
    <Text style={styles.score} accessibilityLabel={t.timeLabel(shown)}>
      {shown}
    </Text>
  );
}

/** The place to find, what the last tap was, and how much of the map is painted. */
function CompletePanel({
  game,
  board,
  country,
  filled,
  total,
  misses,
  best,
}: {
  game: ReturnType<typeof useCompleteGame>;
  board: Board;
  /** The country whose map this is; null on the world map. */
  country: CountryMap | null;
  filled: number;
  total: number;
  misses: number;
  best: number | null;
}) {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();

  if (game.done) {
    return (
      <View style={styles.panel}>
        <View style={styles.footer}>
          <View>
            <Text style={[styles.verdict, { color: colors.green }]}>{game.record ? t.newRecord : t.mapDone}</Text>
            <Text style={styles.answer}>{t.mapDoneStats(formatTime(game.elapsed()), misses)}</Text>
            {best !== null && best < game.elapsed() && <Text style={styles.answer}>{t.bestTime(formatTime(best))}</Text>}
          </View>
          <Button label={t.startOver} onPress={game.restart} />
        </View>
      </View>
    );
  }
  if (!game.target) return <View style={styles.panel} />;

  const note = game.note;
  const name = (iso: string) => board.regions.find((r) => r.iso === iso)?.[language] ?? iso;
  let noteText = country ? t.tapHintRegion : t.tapHint;
  let noteColor = colors.textMuted;
  if (note?.kind === 'right') [noteText, noteColor] = [t.painted(name(note.iso)), colors.green];
  else if (note?.kind === 'wrong') [noteText, noteColor] = [t.thatIs(name(note.iso)), colors.wrong];
  else if (note?.kind === 'sea') noteText = t.sea;
  else if (note?.kind === 'outside' && country) noteText = t.outside(country[language]);

  return (
    <View style={styles.panel}>
      <View>
        <Text style={styles.prompt}>{game.revealed ? t.showHere : t.find}</Text>
        <Text style={styles.target} numberOfLines={1} adjustsFontSizeToFit>
          {game.target[language]}
        </Text>
        <Text style={[styles.note, { color: noteColor }]} numberOfLines={2}>
          {noteText}
        </Text>
      </View>
      <View style={styles.levelCard}>
        <View style={styles.levelRow}>
          <Text
            style={styles.levelText}
            accessibilityLabel={
              country ? t.regionsFilledLabel(filled, total, country.unit[language]) : t.filledLabel(filled, total)
            }
          >
            {t.filledOf(filled, total)}
          </Text>
          <Pressable accessibilityRole="button" onPress={game.skip} hitSlop={12}>
            <Text style={styles.skip}>{t.skip}</Text>
          </Pressable>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(filled / total) * 100}%` }]} />
        </View>
      </View>
    </View>
  );
}

/** Complete a country: every country on offer, with its progress and record. */
function CountryList({
  summaries,
  onPick,
}: {
  summaries: Record<string, Summary>;
  onPick: (m: CountryMap) => void;
}) {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  return (
    <View style={styles.panel}>
      <Text style={styles.section}>{t.pickCountryHint}</Text>
      {COUNTRY_MAPS.map((m) => {
        const s = summaries[m.id];
        const chip =
          [
            s && s.filled > 0 && s.filled < m.regions ? t.filledOf(s.filled, m.regions) : null,
            s && s.best !== null ? t.bestTime(formatTime(s.best)) : null,
          ]
            .filter(Boolean)
            .join(' · ') || null;
        return (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            onPress={() => onPick(m)}
            style={({ pressed }) => [styles.modeCard, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <View style={styles.modeIcon}>
              <Silhouette iso={m.iso} color={colors.purpleSoft} size={36} />
            </View>
            <View style={styles.modeText}>
              {chip && (
                <View style={styles.chips}>
                  <Chip label={chip} tone="purple" />
                </View>
              )}
              <Text style={styles.modeTitle}>{m[language]}</Text>
              <Text style={styles.modeDescription}>{t.regionCount(m.regions, m.unit[language])}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={28} color={colors.purpleSoft} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Neighbours: the country, what the last tap was, borders found and lives; then the verdict. */
function NeighboursPanel({ game }: { game: ReturnType<typeof useNeighboursGame> }) {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const { target, note } = game;
  if (!target) return <View style={styles.panel} />;
  const name = (iso: string) => BY_ISO.get(iso)?.[language] ?? iso;

  let noteText = t.nbHint;
  let noteColor = colors.textMuted;
  if (note?.kind === 'found') [noteText, noteColor] = [t.nbFound(name(note.iso)), colors.green];
  else if (note?.kind === 'wrong') [noteText, noteColor] = [t.nbWrong(name(note.iso)), colors.wrong];
  else if (note?.kind === 'self') noteText = t.nbSelf;
  else if (note?.kind === 'again') noteText = t.nbAgain(name(note.iso));
  else if (note?.kind === 'sea') noteText = t.sea;
  const missed = game.borders.length - game.found.length;

  return (
    <View style={styles.panel}>
      <View>
        <Text style={styles.prompt}>{t.askNeighbours}</Text>
        <Text style={styles.target} numberOfLines={1} adjustsFontSizeToFit>
          {target[language]}
        </Text>
        {!game.revealed && (
          <Text style={[styles.note, { color: noteColor }]} numberOfLines={2}>
            {noteText}
          </Text>
        )}
      </View>
      {game.revealed ? (
        <View style={styles.footer}>
          <View>
            <Text style={[styles.verdict, { color: game.complete ? colors.green : colors.wrong }]}>
              {game.over ? t.nbOver : game.isRecord ? t.newRecord : game.complete ? t.nbComplete : t.nbMissed(missed)}
            </Text>
            <Text style={styles.answer}>
              {game.over ? t.nbOverStats(game.points, game.done) : t.bordersFound(game.found.length, game.borders.length)}
            </Text>
          </View>
          <Button label={game.over ? t.playAgain : t.next} onPress={game.next} />
        </View>
      ) : (
        <View style={styles.levelCard}>
          <View style={styles.levelRow}>
            <Text style={styles.levelText}>{t.bordersFound(game.found.length, game.borders.length)}</Text>
            <View style={styles.hearts} accessibilityLabel={t.livesLabel(game.lives)}>
              {Array.from({ length: LIVES }, (_, i) => (
                <MaterialCommunityIcons
                  key={i}
                  name={i < game.lives ? 'heart' : 'heart-outline'}
                  size={20}
                  color={colors.wrong}
                />
              ))}
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(game.found.length / game.borders.length) * 100}%` }]} />
          </View>
          <View style={styles.levelRow}>
            <Text style={styles.levelNote}>{t.level(levelFor(game.done))}</Text>
            <Pressable accessibilityRole="button" onPress={game.giveUp} hitSlop={12}>
              <Text style={styles.skip}>{t.giveUp}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/** The map of the day, once done: the score, a square per question, the streak and Share. */
function DailyPanel({ day, score, streak }: { day: string; score: DailyScore; streak: number }) {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const share = () => {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(y, m - 1, d).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });
    Share.share({ message: t.shareText(date, squares(score.results), score.correct, DAILY_ROUNDS, score.points) }).catch(
      () => {},
    );
  };
  return (
    <View style={styles.panel}>
      <View style={styles.footer}>
        <View>
          <Text style={[styles.verdict, { color: colors.green }]}>{t.dailyDone}</Text>
          <Text style={styles.answer}>{t.dailyScore(score.correct, DAILY_ROUNDS, score.points)}</Text>
        </View>
        <View style={styles.squares} accessibilityLabel={t.dailyScore(score.correct, DAILY_ROUNDS, score.points)}>
          {score.results.map((r, i) => (
            <View key={i} style={[styles.square, { backgroundColor: r ? colors.green : colors.wrong }]} />
          ))}
        </View>
        <View style={styles.streakRow}>
          <MaterialCommunityIcons name="fire" size={22} color={colors.green} />
          <Text style={styles.levelText}>{t.dayStreak(streak)}</Text>
        </View>
        <Text style={styles.answer}>{t.dailyBack}</Text>
        <Button label={t.share} onPress={share} />
      </View>
    </View>
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
  round,
  onNext,
}: {
  answered: boolean;
  right: boolean;
  isRecord: boolean;
  gained: number;
  streak: number;
  question: Question;
  /** Map of the day: the question's place among the day's, from 0. */
  round: { n: number; total: number } | null;
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

  if (!answered && round) {
    return (
      <View style={styles.levelCard}>
        <View style={styles.levelRow}>
          <Text style={styles.levelText}>{t.dailyRound(round.n + 1, round.total)}</Text>
          <Text style={styles.levelNote}>{t.level(dailyLevel(round.n))}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(round.n / round.total) * 100}%` }]} />
        </View>
      </View>
    );
  }

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
          {right ? (isRecord ? t.newRecord : t.correct(gained)) : round ? t.dailyWrong : t.wrong}
        </Text>
        <Text style={styles.answer} numberOfLines={1}>
          {right ? answerText : t.itWas(answerText)}
          {detail ? ` · ${detail}` : ''}
        </Text>
      </View>
      <Button label={round && round.n + 1 === round.total ? t.seeResult : t.next} onPress={onNext} />
    </Animated.View>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    safe: { flex: 1 },
    content: { flexGrow: 1 },
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
    headerTitle: { flex: 1, textAlign: 'center', marginRight: space(6) },
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
    cover: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    squares: { flexDirection: 'row', justifyContent: 'center', gap: space(1) },
    square: { width: 22, height: 22, borderRadius: 6 },
    hearts: { flexDirection: 'row', gap: space(1) },
    streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2) },
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
      padding: space(4),
      marginBottom: space(1),
    },
    modeIcon: {
      width: 52,
      height: 52,
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
    target: { color: colors.text, fontFamily: fonts.heavy, fontSize: 28, marginTop: space(1) },
    note: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, minHeight: 40, marginTop: space(1) },
    skip: { color: colors.purpleSoft, fontFamily: fonts.heavy, fontSize: 15 },
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
