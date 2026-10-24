import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/components/ui';
import { formatTime } from '@/game/complete';
import { COUNTRY_MAPS } from '@/game/countries';
import { getStats, KEEP_RUNS, weekStart, type Stats } from '@/game/stats';
import { useSettings, type Mode } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

type Board = Mode | 'complete' | 'country';
type Period = 'week' | 'all';
type RowData = { key: string; title: string; value: string; at: number };

// Vocablo's Ranking with what lives on this phone: your best games per mode,
// this week or all time. The online tables (leagues, countries, groups) need
// accounts and a server, so they wait.
export default function RankingTab() {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<Board>('countries');
  const [period, setPeriod] = useState<Period>('all');
  // Complete a country: which country's table, by board id.
  const [countryId, setCountryId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getStats().then(setStats);
    }, []),
  );

  const date = (at: number) =>
    new Date(at).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short' });
  const since = period === 'week' ? weekStart(new Date()) : 0;
  // Countries with a finished map, in the order of the country list.
  const played = stats ? COUNTRY_MAPS.filter((m) => stats.countryMaps[m.id]?.length) : [];
  const shownCountry = played.find((m) => m.id === countryId) ?? played[0] ?? null;
  const mapRows = (maps: { ms: number; misses: number; at: number }[]) =>
    maps
      .filter((m) => m.at >= since)
      .map((m) => ({ key: `${m.at}`, title: t.mapTitle(m.misses), value: formatTime(m.ms), at: m.at }));
  const rows: RowData[] = !stats
    ? []
    : board === 'complete'
      ? mapRows(stats.maps)
      : board === 'country'
        ? mapRows(shownCountry ? stats.countryMaps[shownCountry.id] : [])
      : stats.runs[board]
          .filter((r) => r.at >= since)
          .map((r) => ({ key: `${r.id}`, title: t.runTitle(r.streak), value: `${r.points}`, at: r.at }));
  const latest = Math.max(0, ...rows.map((r) => r.at));
  const boards: { id: Board; label: string }[] = [
    { id: 'countries', label: t.modeCountries },
    { id: 'capitals', label: t.modeCapitals },
    { id: 'complete', label: t.modeComplete },
    { id: 'country', label: t.modeCountry },
  ];

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t.rankingTitle}</Text>

          <Card>
            <View style={styles.row}>
              <View style={styles.tierIcon}>
                <MaterialCommunityIcons name="earth" size={28} color={colors.purpleSoft} />
              </View>
              <Text style={[styles.big, { flex: 1 }]}>{t.rankingSoon}</Text>
            </View>
            <Text style={styles.muted}>{t.rankingBody}</Text>
          </Card>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.yourBest}</Text>
            <View style={styles.chips}>
              {boards.map((b) => (
                <Toggle key={b.id} label={b.label} on={board === b.id} onPress={() => setBoard(b.id)} />
              ))}
            </View>
            {board === 'country' && played.length > 0 && (
              <View style={styles.chips}>
                {played.map((m) => (
                  <Toggle
                    key={m.id}
                    label={m[language]}
                    on={shownCountry?.id === m.id}
                    onPress={() => setCountryId(m.id)}
                  />
                ))}
              </View>
            )}
            <View style={styles.segment}>
              {(['week', 'all'] as const).map((p) => (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  accessibilityState={{ selected: period === p }}
                  onPress={() => setPeriod(p)}
                  style={[styles.segmentItem, period === p && styles.segmentOn]}
                >
                  <Text style={[styles.segmentText, period === p && { color: colors.text }]}>
                    {p === 'week' ? t.thisWeek : t.allTime}
                  </Text>
                </Pressable>
              ))}
            </View>

            {!stats ? null : rows.length === 0 ? (
              <Card>
                <Text style={styles.muted}>
                  {board === 'country' && !shownCountry
                    ? t.rankingEmptyCountry
                    : period === 'week'
                      ? t.rankingEmptyWeek
                      : t.rankingEmpty}
                </Text>
              </Card>
            ) : (
              <Card>
                <View style={styles.table}>
                  {rows.map((r, i) => (
                    <Row
                      key={r.key}
                      rank={i + 1}
                      title={r.title}
                      detail={date(r.at)}
                      value={r.value}
                      latest={rows.length > 1 && r.at === latest}
                    />
                  ))}
                </View>
                <Text style={styles.note}>
                  {board === 'complete'
                    ? t.mapsNote(stats.mapsDone, KEEP_RUNS)
                    : board === 'country'
                      ? t.mapsNote(shownCountry ? (stats.countryMapsDone[shownCountry.id] ?? 0) : 0, KEEP_RUNS)
                      : t.rankingNote(stats.runs[board].length, KEEP_RUNS)}
                </Text>
              </Card>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function Row({
  rank,
  title,
  detail,
  value,
  latest,
}: {
  rank: number;
  title: string;
  detail: string;
  value: string;
  latest: boolean;
}) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  return (
    <View style={[styles.tableRow, latest && styles.tableRowMe]}>
      <Text style={[styles.rank, rank <= 3 && { color: colors.green }]}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.detail}>
          {detail}
          {latest ? t.latest : ''}
        </Text>
      </View>
      <Text style={styles.points}>{value}</Text>
    </View>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors, styles } = useThemed();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.toggle, on && styles.toggleOn]}
    >
      <Text style={[styles.toggleText, on && { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Card({ children }: { children: ReactNode }) {
  const { styles } = useThemed();
  return <View style={styles.card}>{children}</View>;
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    safe: { flex: 1 },
    body: { paddingTop: space(6), paddingBottom: space(10), gap: space(5) },
    title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 32 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(5),
      gap: space(4),
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
    big: { color: colors.text, fontFamily: fonts.heavy, fontSize: 20 },
    muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
    note: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
    tierIcon: {
      width: 52,
      height: 52,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: colors.purpleSoft,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    table: { gap: space(1) },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(3),
      paddingVertical: space(2),
      paddingHorizontal: space(3),
      borderRadius: radius.sm,
    },
    tableRowMe: { backgroundColor: colors.tint },
    rank: { width: 28, color: colors.textMuted, fontFamily: fonts.heavy, fontSize: 15, fontVariant: ['tabular-nums'] },
    name: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
    detail: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
    points: {
      minWidth: 52,
      textAlign: 'right',
      color: colors.green,
      fontFamily: fonts.heavy,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    section: { gap: space(3) },
    sectionTitle: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
    toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(1),
      maxWidth: 200,
      paddingVertical: space(2),
      paddingHorizontal: space(4),
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
    },
    toggleOn: { backgroundColor: colors.purpleDeep },
    toggleText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 14 },
    segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: space(1) },
    segmentItem: { flex: 1, alignItems: 'center', paddingVertical: space(2), borderRadius: radius.pill },
    segmentOn: { backgroundColor: colors.surfaceRaised },
    segmentText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 14 },
  }),
}));
