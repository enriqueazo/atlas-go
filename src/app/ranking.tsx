import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';

import { Card, Chip, Screen } from '@/components/ui';
import { useSettings } from '@/settings';
import { radius, space, themed, type, useTheme } from '@/theme';

// Placeholder until online rankings exist: your records in a ranking table,
// with empty rows where other players will appear.
export default function RankingScreen() {
  const s = useStyles();
  const { c } = useTheme();
  const { t, records } = useSettings();

  const boards = [
    { key: 'countries', title: t.modeCountries, icon: 'earth', points: records.countries },
    { key: 'capitals', title: t.modeCapitals, icon: 'map-marker-star-outline', points: records.capitals },
  ] as const;

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{t.rankingTitle}</Text>

        <Card style={s.soon}>
          <View style={s.soonIcon}>
            <MaterialCommunityIcons name="podium" size={28} color={c.text} />
          </View>
          <View style={{ flex: 1, gap: space(2) }}>
            <Chip label={t.rankingSoon} tone="purple" />
            <Text style={s.small}>{t.rankingBody}</Text>
          </View>
        </Card>

        {boards.map((b) => (
          <Card key={b.key}>
            <View style={s.boardHead}>
              <MaterialCommunityIcons name={b.icon} size={22} color={c.purpleSoft} />
              <Text style={s.boardTitle}>{b.title}</Text>
            </View>
            {[1, 2].map((pos) => (
              <View key={pos} style={s.row}>
                <Text style={s.pos}>{pos}</Text>
                <View style={s.avatarEmpty} />
                <View style={s.barEmpty} />
                <Text style={s.ptsEmpty}>—</Text>
              </View>
            ))}
            <View style={[s.row, s.rowMine]}>
              <Text style={[s.pos, { color: c.purpleSoft }]}>·</Text>
              <View style={s.avatar}>
                <MaterialCommunityIcons name="account" size={18} color={c.onPurple} />
              </View>
              <Text style={s.name}>{t.you}</Text>
              <Text style={s.pts}>{b.points}</Text>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = themed((c) => ({
  body: { paddingTop: space(4), paddingBottom: space(10), gap: space(4) },
  title: { ...type.title, color: c.text, marginBottom: space(2) },
  soon: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  soonIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: c.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { ...type.small, color: c.textMuted },
  boardHead: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  boardTitle: { ...type.cardTitle, color: c.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(2),
    paddingHorizontal: space(3),
    borderRadius: radius.sm,
  },
  rowMine: { backgroundColor: c.tint },
  pos: { ...type.counter, width: 20, textAlign: 'center', color: c.textMuted },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmpty: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceRaised },
  barEmpty: { flex: 1, height: 12, borderRadius: radius.pill, backgroundColor: c.surfaceRaised },
  name: { ...type.label, flex: 1, color: c.text },
  pts: { ...type.counter, color: c.green },
  ptsEmpty: { ...type.counter, color: c.textMuted },
}));
