import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { fetchProfile, getCachedProfile, type Profile } from '@/cloud/account';
import { CLOUD_READY } from '@/cloud/config';
import {
  createGroup,
  failed,
  joinGroup,
  leaveGroup,
  myGroups,
  myLeague,
  ranking,
  type Group,
  type League,
  type Period,
  type Ranking as RankingData,
  type Scope,
} from '@/cloud/ranked';
import { clampTier, hoursLeft, LEAGUE_DEMOTE, LEAGUE_PROMOTE, TIER_ICONS } from '@/game/leagues';
import { useSettings } from '@/settings';
import { fonts, radius, space, themed, type Palette } from '@/theme';

import { countryName } from './AccountCard';
import { Button } from './ui';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const tierColors = (colors: Palette) => [colors.green, colors.purpleSoft, colors.purple, colors.wrong, colors.text];

/**
 * The online half of the Ranking tab, as in Vocablo: this week's league, the
 * standings (world, the player's country, or a group) and the groups. Before
 * a Supabase project is set up it says online rankings are on the way.
 */
export function OnlineRanking({ extra }: { extra?: ReactNode }) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [league, setLeague] = useState<League | null>(null);
  const [offline, setOffline] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  // Bumped on each visit, so the tables reload too.
  const [visit, setVisit] = useState(0);

  const loadGroups = useCallback(() => {
    myGroups().then((g) => !failed(g) && setGroups(g));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!CLOUD_READY) return;
      getCachedProfile().then((p) => setProfile((current) => current ?? p ?? undefined));
      fetchProfile().then(setProfile);
      myLeague().then((l) => {
        setOffline(failed(l));
        if (!failed(l)) setLeague(l);
      });
      loadGroups();
      setVisit((v) => v + 1);
    }, [loadGroups]),
  );

  if (!CLOUD_READY) {
    return (
      <Card>
        <View style={styles.row}>
          <View style={[styles.tierIcon, { borderColor: colors.border }]}>
            <MaterialCommunityIcons name="earth" size={28} color={colors.purpleSoft} />
          </View>
          <Text style={[styles.big, { flex: 1 }]}>{t.rankingSoon}</Text>
        </View>
        <Text style={styles.muted}>{t.rankingBody}</Text>
      </Card>
    );
  }

  if (profile === undefined) return <ActivityIndicator color={colors.purple} />;
  if (profile === null) return <NoProfile />;

  return (
    <>
      {offline && !league ? (
        <Card>
          <Text style={styles.muted}>{t.cloudError('offline')}</Text>
        </Card>
      ) : league ? (
        <LeagueCard league={league} />
      ) : (
        <ActivityIndicator color={colors.purple} />
      )}
      {extra}
      <Tables profile={profile} groups={groups} visit={visit} onGroupsChange={loadGroups} />
    </>
  );
}

function NoProfile() {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  return (
    <Card>
      <MaterialCommunityIcons name="account-circle-outline" size={40} color={colors.purpleSoft} />
      <Text style={styles.big}>{t.createProfile}</Text>
      <Text style={styles.muted}>{t.createProfileBody}</Text>
      <Button label={t.goSettings} onPress={() => router.push('/settings')} style={styles.left} />
    </Card>
  );
}

function LeagueCard({ league }: { league: League }) {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const tier = clampTier(league.tier);
  const tint = tierColors(colors)[tier];
  const name = t.tiers[tier];
  const change = league.last_change === 1 ? t.leagueUp(name) : league.last_change === -1 ? t.leagueDown(name) : null;
  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.tierIcon, { borderColor: tint }]}>
          <MaterialCommunityIcons name={TIER_ICONS[tier]} size={28} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.small}>{t.weeklyLeague}</Text>
          <Text style={styles.big}>{name}</Text>
        </View>
        <Text style={styles.small}>{t.endsIn(hoursLeft(new Date(league.ends_at), new Date()))}</Text>
      </View>
      {change && (
        <View style={[styles.banner, league.last_change === 1 ? styles.bannerUp : styles.bannerDown]}>
          <Text style={styles.bannerText}>{change}</Text>
        </View>
      )}
      {league.joined ? (
        <>
          <Text style={styles.note}>{t.leagueRule(LEAGUE_PROMOTE, tier > 0 ? LEAGUE_DEMOTE : 0)}</Text>
          <View style={styles.table}>
            {league.rows.map((r) => (
              <Row
                key={`${r.rank}-${r.nickname}`}
                rank={r.rank}
                name={r.nickname}
                detail={r.country ? countryName(r.country, language, t.countryOther) : undefined}
                points={r.points}
                me={r.me}
                marker={r.zone}
              />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.muted}>{t.leagueJoin}</Text>
      )}
      <Button label={t.playRanked} onPress={() => router.push('/ranked')} />
    </Card>
  );
}

function Tables({
  profile,
  groups,
  visit,
  onGroupsChange,
}: {
  profile: Profile;
  groups: Group[];
  visit: number;
  onGroupsChange: () => void;
}) {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const [scope, setScope] = useState<Scope>('global');
  const [period, setPeriod] = useState<Period>('week');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [data, setData] = useState<RankingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const group = groups.find((g) => g.id === groupId) ?? groups[0] ?? null;
  const needsGroup = scope === 'group' && !group;

  useEffect(() => {
    setData(null);
    setError(null);
    if (needsGroup) return;
    let live = true;
    ranking(scope, period, scope === 'group' ? group?.id : undefined).then((r) => {
      if (!live) return;
      if (failed(r)) setError(r.error);
      else setData(r);
    });
    return () => {
      live = false;
    };
  }, [scope, period, group?.id, needsGroup, visit]);

  const scopes: { id: Scope; label: string }[] = [
    { id: 'global', label: t.scopeWorld },
    { id: 'country', label: countryName(profile.country, language, t.countryOther) },
    { id: 'group', label: t.scopeGroups },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t.standings}</Text>
      <View style={styles.chips}>
        {scopes.map((s) => (
          <Toggle key={s.id} label={s.label} on={scope === s.id} onPress={() => setScope(s.id)} />
        ))}
      </View>
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

      {scope === 'group' && <Groups groups={groups} selected={group} onSelect={setGroupId} onChange={onGroupsChange} />}

      {needsGroup ? null : error ? (
        <Card>
          <Text style={styles.muted}>{t.cloudError(error)}</Text>
        </Card>
      ) : !data ? (
        <ActivityIndicator color={colors.purple} />
      ) : data.rows.length === 0 ? (
        <Card>
          <Text style={styles.muted}>{period === 'week' ? t.nobodyWeek : t.nobodyAll}</Text>
        </Card>
      ) : (
        <Card>
          <View style={styles.table}>
            {data.rows.map((r) => (
              <Row
                key={`${r.rank}-${r.nickname}`}
                rank={r.rank}
                name={r.nickname}
                detail={scope === 'country' ? undefined : countryName(r.country, language, t.countryOther)}
                points={r.points}
                me={r.me}
              />
            ))}
            {data.me && !data.rows.some((r) => r.me) && (
              <>
                <Text style={styles.gap}>···</Text>
                <Row rank={data.me.rank} name={profile.nickname} points={data.me.points} me />
              </>
            )}
          </View>
          <Text style={styles.note}>
            {t.players(data.total)}
            {data.me ? '' : t.playToAppear}
          </Text>
        </Card>
      )}
    </View>
  );
}

function Groups({
  groups,
  selected,
  onSelect,
  onChange,
}: {
  groups: Group[];
  selected: Group | null;
  onSelect: (id: string) => void;
  onChange: () => void;
}) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const [mode, setMode] = useState<'create' | 'join' | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = mode === 'create' ? await createGroup(text) : await joinGroup(text);
    setBusy(false);
    if (failed(r)) {
      setError(t.cloudError(r.error));
      return;
    }
    setText('');
    setMode(null);
    onSelect(r.id);
    onChange();
  };

  const leave = async (g: Group) => {
    if (!failed(await leaveGroup(g.id))) onChange();
  };

  const share = (g: Group) => Share.share({ message: t.groupInvite(g.name, g.code) }).catch(() => {});

  return (
    <View style={styles.groups}>
      {groups.length > 0 && (
        <View style={styles.chips}>
          {groups.map((g) => (
            <Toggle key={g.id} label={g.name} on={selected?.id === g.id} onPress={() => onSelect(g.id)} />
          ))}
        </View>
      )}
      {selected && (
        <View style={styles.groupInfo}>
          <Text style={styles.small}>
            {t.groupCode} <Text style={styles.code}>{selected.code}</Text>
            {selected.members ? ` · ${t.players(selected.members)}` : ''}
          </Text>
          <View style={styles.groupActions}>
            <Pressable accessibilityRole="button" onPress={() => share(selected)} hitSlop={8}>
              <Text style={styles.link}>{t.invite}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => leave(selected)} hitSlop={8}>
              <Text style={[styles.link, { color: colors.textMuted }]}>{t.leaveGroup}</Text>
            </Pressable>
          </View>
        </View>
      )}
      {mode ? (
        <Card>
          <Text style={styles.label}>{mode === 'create' ? t.groupName : t.groupCodeLabel}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={mode === 'create' ? t.groupNamePlaceholder : t.groupCodePlaceholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize={mode === 'join' ? 'characters' : 'sentences'}
            autoCorrect={false}
            maxLength={mode === 'create' ? 30 : 6}
            accessibilityLabel={mode === 'create' ? t.groupName : t.groupCodeLabel}
            style={styles.input}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.formButtons}>
            <Button
              label={busy ? '…' : mode === 'create' ? t.createGroup : t.joinGroup}
              onPress={submit}
              style={{ flex: 1 }}
            />
            <Button label={t.cancel} variant="ghost" onPress={() => setMode(null)} />
          </View>
        </Card>
      ) : (
        <View style={styles.groupActions}>
          <Toggle label={t.createGroup} icon="plus" on={false} onPress={() => setMode('create')} />
          <Toggle label={t.joinWithCode} icon="account-plus-outline" on={false} onPress={() => setMode('join')} />
        </View>
      )}
      {groups.length === 0 && !mode && <Text style={styles.note}>{t.groupsHint}</Text>}
    </View>
  );
}

function Row({
  rank,
  name,
  detail,
  points,
  me,
  marker = 0,
}: {
  rank: number;
  name: string;
  detail?: string;
  points: number;
  me: boolean;
  marker?: number;
}) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  return (
    <View style={[styles.tableRow, me && styles.tableRowMe]}>
      <Text style={[styles.rank, rank <= 3 && { color: colors.green }]}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
          {me ? t.you : ''}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {marker !== 0 && (
        <MaterialCommunityIcons
          name={marker > 0 ? 'arrow-up-bold' : 'arrow-down-bold'}
          size={16}
          color={marker > 0 ? colors.green : colors.wrong}
          accessibilityLabel={marker > 0 ? t.goesUp : t.goesDown}
        />
      )}
      <Text style={styles.points}>{points}</Text>
    </View>
  );
}

function Toggle({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: IconName }) {
  const { colors, styles } = useThemed();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.toggle, on && styles.toggleOn]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={16} color={colors.purpleSoft} />}
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
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(5),
      gap: space(4),
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
    big: { color: colors.text, fontFamily: fonts.heavy, fontSize: 22 },
    muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
    small: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 13 },
    note: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
    left: { alignSelf: 'flex-start' },
    link: { color: colors.purpleSoft, fontFamily: fonts.bold, fontSize: 15 },
    tierIcon: {
      width: 52,
      height: 52,
      borderRadius: 18,
      borderWidth: 2,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    banner: { borderRadius: radius.sm, paddingVertical: space(3), paddingHorizontal: space(4) },
    bannerUp: { backgroundColor: colors.greenSoft },
    bannerDown: { backgroundColor: colors.wrongSoft },
    bannerText: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
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
    gap: { color: colors.textMuted, textAlign: 'center', fontFamily: fonts.bold },
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
    groups: { gap: space(3) },
    groupInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) },
    groupActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(3) },
    code: { color: colors.text, fontFamily: fonts.heavy, letterSpacing: 2 },
    label: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
    input: {
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
    error: { color: colors.wrong, fontFamily: fonts.bold, fontSize: 14 },
    formButtons: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  }),
}));
