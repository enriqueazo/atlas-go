import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/components/ui';
import { useSettings, type Mode } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

// A placeholder until online rankings exist, built from the pieces of
// Vocablo's Ranking: the empty-profile card, a section with toggles, and the
// table with your own row tinted.
export default function RankingTab() {
  const { colors, styles } = useThemed();
  const { t, records } = useSettings();
  const [mode, setMode] = useState<Mode>('countries');

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t.rankingTitle}</Text>

          <Card>
            <MaterialCommunityIcons name="podium" size={40} color={colors.purpleSoft} />
            <Text style={styles.big}>{t.rankingSoon}</Text>
            <Text style={styles.muted}>{t.rankingBody}</Text>
          </Card>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.yourRecords}</Text>
            <View style={styles.chips}>
              <Toggle label={t.modeCountries} on={mode === 'countries'} onPress={() => setMode('countries')} />
              <Toggle label={t.modeCapitals} on={mode === 'capitals'} onPress={() => setMode('capitals')} />
            </View>
            <Card>
              <View style={styles.table}>
                <Row rank={1} name={t.you} points={records[mode]} me />
              </View>
              <Text style={styles.note}>{t.rankingNote}</Text>
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function Row({ rank, name, points, me }: { rank: number; name: string; points: number; me: boolean }) {
  const { colors, styles } = useThemed();
  return (
    <View style={[styles.tableRow, me && styles.tableRowMe]}>
      <Text style={[styles.rank, rank <= 3 && { color: colors.green }]}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text style={styles.points}>{points}</Text>
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
    big: { color: colors.text, fontFamily: fonts.heavy, fontSize: 22 },
    muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
    note: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
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
  }),
}));
