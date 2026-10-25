import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/components/ui';
import { formatTime, WORLD_BOARD } from '@/game/complete';
import { COUNTRY_MAPS } from '@/game/countries';
import { loadBoard, loadSaved } from '@/game/progress';
import {
  accuracy,
  capitalCountries,
  CONTINENTS,
  dayKey,
  dayStreak,
  getStats,
  knownByTier,
  totals,
  weekActivity,
  type Stats,
} from '@/game/stats';
import { COUNTRIES } from '@/game/world';
import { useSettings } from '@/settings';
import { fonts, radius, space, themed, type Palette } from '@/theme';

type Saved = { filled: number; best: number | null };
/** The world map's progress, and each country's map by board id. */
type Data = { stats: Stats; filled: number; best: number | null; countries: Record<string, Saved> };
type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * One colour per difficulty tier, from the best-known countries (green) to
 * microstates (pink). Two come from the map's land colours, so all five stay
 * apart in light and dark.
 */
const tierColors = (colors: Palette) => [colors.green, colors.land[2], colors.purple, colors.land[4], colors.wrong];

// Vocablo's Progreso tab, with countries and capitals in place of words and
// continents in place of word levels.
export default function Progress() {
  const { styles } = useThemed();
  const { t } = useSettings();
  const [data, setData] = useState<Data | null>(null);
  useFocusEffect(
    useCallback(() => {
      Promise.all([getStats(), loadBoard(WORLD_BOARD), Promise.all(COUNTRY_MAPS.map((m) => loadSaved(m.id)))]).then(
        ([stats, board, countries]) =>
          setData({
            stats,
            filled: board.filled.length,
            best: board.best,
            countries: Object.fromEntries(
              countries.map((c, i) => [COUNTRY_MAPS[i].id, { filled: c.filled.length, best: c.best }]),
            ),
          }),
      );
    }, []),
  );

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t.progressTitle}</Text>
          {data &&
          totals(data.stats).answers === 0 &&
          data.filled === 0 &&
          !Object.values(data.countries).some((c) => c.filled > 0 || c.best !== null) ? (
            <Text style={styles.empty}>{t.progressEmpty}</Text>
          ) : (
            data && <Content {...data} />
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function Content({ stats, filled, best, countries }: Data) {
  const { colors, styles } = useThemed();
  const { t, records, language } = useSettings();
  // Countries whose map was started, in the order of the country list.
  const started = COUNTRY_MAPS.filter((m) => countries[m.id]?.filled || countries[m.id]?.best !== null);
  const now = new Date();
  const streak = dayStreak(stats.days, now);
  const today = stats.days[dayKey(now)];
  const overall = totals(stats);
  const pct = accuracy(overall);

  return (
    <>
      <Card>
        <View style={styles.row}>
          <MaterialCommunityIcons name="fire" size={34} color={streak > 0 ? colors.green : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.big}>{streak === 0 ? t.noStreak : t.dayStreak(streak)}</Text>
            <Text style={styles.muted}>
              {today ? t.todayTally(today.correct, today.answers) : streak > 0 ? t.keepStreak : t.startStreak}
            </Text>
          </View>
        </View>
        <View style={styles.week}>
          {weekActivity(stats.days, now).map((d) => (
            <View key={d.key} style={styles.weekDay}>
              <View
                style={[
                  styles.dot,
                  d.answers > 0 && styles.dotOn,
                  d.isToday && styles.dotToday,
                  d.isFuture && { opacity: 0.35 },
                ]}
              >
                {d.answers > 0 && <MaterialCommunityIcons name="check" size={16} color={colors.bg} />}
              </View>
              <Text style={[styles.weekLetter, d.isToday && { color: colors.text }]}>{t.weekLetters[d.index]}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Section title={t.world}>
        <Card>
          <Known count={knownByTier(stats.known.countries, COUNTRIES)} total={COUNTRIES.length} label={t.countriesKnown} />
          <Known
            count={knownByTier(stats.known.capitals, capitalCountries())}
            total={capitalCountries().length}
            label={t.capitalsKnown}
          />
          <View style={styles.legend}>
            {tierColors(colors).map((color, i) => (
              <View key={i} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: color }]} />
                <Text style={styles.legendText}>{t.level(i + 1)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>{t.knownNote}</Text>
        </Card>
      </Section>

      <Section title={t.accuracyByContinent}>
        <Card>
          {CONTINENTS.map((c) => {
            const value = accuracy(stats.continents[c]);
            return (
              <View key={c} style={styles.levelRow}>
                <Text style={styles.levelLabel} numberOfLines={1}>
                  {t.continents[c]}
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${value ?? 0}%` }]} />
                </View>
                <Text style={styles.levelValue}>{value === null ? '–' : `${value}%`}</Text>
              </View>
            );
          })}
        </Card>
      </Section>

      <Section title={t.records}>
        <Record
          icon="earth"
          title={t.modeCountries}
          value={`${records.countries}`}
          unit={t.pointsUnit(stats.bestStreak.countries)}
        />
        <Record
          icon="map-marker-star-outline"
          title={t.modeCapitals}
          value={`${records.capitals}`}
          unit={t.pointsUnit(stats.bestStreak.capitals)}
        />
        {best !== null ? (
          <Record
            icon="map-check-outline"
            title={t.modeComplete}
            value={formatTime(best)}
            unit={t.bestTimeUnit(Math.max(1, stats.mapsDone))}
          />
        ) : (
          <Record icon="map-check-outline" title={t.modeComplete} value={`${filled}`} unit={t.mapUnit(COUNTRIES.length)} />
        )}
        {started.map((m) => {
          const c = countries[m.id];
          return c.best !== null ? (
            <Record
              key={m.id}
              icon="map-legend"
              title={m[language]}
              value={formatTime(c.best)}
              unit={t.bestTimeUnit(Math.max(1, stats.countryMapsDone[m.id] ?? 0))}
            />
          ) : (
            <Record
              key={m.id}
              icon="map-legend"
              title={m[language]}
              value={`${c.filled}`}
              unit={t.regionsUnit(m.regions, m.unit[language])}
            />
          );
        })}
        <View style={styles.totals}>
          <Total label={t.answers} value={overall.answers} />
          <Total label={t.hits} value={overall.correct} />
          <Total label={t.accuracy} value={pct === null ? '–' : `${pct}%`} />
        </View>
      </Section>
    </>
  );
}

/** How many places you know, as a number and a bar split by tier. */
function Known({ count, total, label }: { count: number[]; total: number; label: (n: number) => string }) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const colorsByTier = tierColors(colors);
  const sum = count.reduce((a, b) => a + b, 0);
  return (
    <View style={styles.known}>
      <View style={styles.rowBaseline}>
        <Text style={styles.huge}>{sum}</Text>
        <Text style={styles.muted}>
          {t.ofTotal(total)} · {label(sum)}
        </Text>
      </View>
      <View style={styles.stack}>
        {count.map((n, i) =>
          n > 0 ? <View key={i} style={[styles.stackPart, { flex: n, backgroundColor: colorsByTier[i] }]} /> : null,
        )}
        {total > sum && <View style={[styles.stackPart, { flex: total - sum, backgroundColor: colors.surfaceRaised }]} />}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { styles } = useThemed();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  const { styles } = useThemed();
  return <View style={styles.card}>{children}</View>;
}

function Record({ icon, title, value, unit }: { icon: IconName; title: string; value: string; unit: string }) {
  const { colors, styles } = useThemed();
  return (
    <View style={[styles.card, styles.row]}>
      <View style={styles.recordIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.text} />
      </View>
      <Text style={styles.recordTitle}>{title}</Text>
      <View style={styles.recordValue}>
        <Text style={styles.recordNumber}>{value}</Text>
        <Text style={styles.recordUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function Total({ label, value }: { label: string; value: number | string }) {
  const { styles } = useThemed();
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    safe: { flex: 1 },
    body: { paddingTop: space(6), paddingBottom: space(10), gap: space(5) },
    title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 32 },
    empty: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
    section: { gap: space(3) },
    sectionTitle: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(5),
      gap: space(4),
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
    rowBaseline: { flexDirection: 'row', alignItems: 'baseline', gap: space(2), flexWrap: 'wrap' },
    big: { color: colors.text, fontFamily: fonts.heavy, fontSize: 22 },
    huge: { color: colors.text, fontFamily: fonts.heavy, fontSize: 40 },
    muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15 },
    note: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
    week: { flexDirection: 'row', justifyContent: 'space-between' },
    weekDay: { alignItems: 'center', gap: space(1) },
    dot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotOn: { backgroundColor: colors.green },
    dotToday: { borderWidth: 2, borderColor: colors.purpleSoft },
    weekLetter: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 13 },
    known: { gap: space(2) },
    stack: { flexDirection: 'row', height: 14, borderRadius: radius.pill, overflow: 'hidden', gap: 2 },
    stackPart: { height: '100%' },
    legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space(4), rowGap: space(2) },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
    swatch: { width: 10, height: 10, borderRadius: 5 },
    legendText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14 },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
    levelLabel: { color: colors.text, fontFamily: fonts.bold, fontSize: 14, width: 108 },
    track: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.purple },
    levelValue: { color: colors.text, fontFamily: fonts.bold, fontSize: 14, width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
    recordIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.purpleDeep,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordTitle: { flex: 1, color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
    recordValue: { alignItems: 'flex-end' },
    recordNumber: { color: colors.green, fontFamily: fonts.heavy, fontSize: 24, fontVariant: ['tabular-nums'] },
    recordUnit: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
    totals: { flexDirection: 'row', gap: space(3) },
    total: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: space(4),
      alignItems: 'center',
      gap: space(1),
    },
    totalValue: { color: colors.text, fontFamily: fonts.heavy, fontSize: 22 },
    totalLabel: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 13 },
  }),
}));
