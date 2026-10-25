import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getLocales } from 'expo-localization';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  deleteAccount,
  fetchProfile,
  getCachedProfile,
  isNicknameAvailable,
  lastCloudError,
  NICKNAME,
  saveProfile,
  type Profile,
} from '@/cloud/account';
import { CLOUD_READY } from '@/cloud/config';
import { BY_ISO, COUNTRIES } from '@/game/world';
import type { Lang } from '@/i18n';
import { useSettings } from '@/settings';
import { fonts, radius, space, themed } from '@/theme';

import { Flag } from './Flag';
import { Button } from './ui';

/** Countries other players don't live in, or ones off the game's map. */
export const OTHER = 'ZZ';

export function countryName(iso: string, language: Lang, other: string): string {
  return BY_ISO.get(iso)?.[language] ?? other;
}

/** A first guess from the phone's region, e.g. es-MX → MX. */
function guessCountry(): string {
  try {
    const region = getLocales()[0]?.regionCode?.toUpperCase();
    return region && BY_ISO.has(region) ? region : OTHER;
  } catch {
    return OTHER;
  }
}

/** "Cuenta" in Ajustes, as in Vocablo: the name and country other players will see. */
export function AccountCard() {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    if (!CLOUD_READY) return;
    getCachedProfile().then((p) => setProfile((current) => current ?? p ?? undefined));
    fetchProfile().then(setProfile);
  }, []);
  useFocusEffect(load);

  if (!CLOUD_READY) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.account}</Text>
        <View style={styles.row}>
          <MaterialCommunityIcons name="cloud-off-outline" size={20} color={colors.textMuted} />
          <Text style={[styles.text, { flex: 1 }]}>{t.accountOffline}</Text>
        </View>
      </View>
    );
  }

  const confirmDelete = () => {
    const run = async () => {
      if (await deleteAccount()) {
        setProfile(null);
        setEditing(false);
      } else if (Platform.OS === 'web') {
        window.alert(t.deleteFailed);
      } else {
        Alert.alert(t.deleteAccount, t.deleteFailed);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${t.deleteTitle}\n${t.deleteBody}`)) run();
      return;
    }
    Alert.alert(t.deleteTitle, t.deleteBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.deleteAccount, style: 'destructive', onPress: run },
    ]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t.account}</Text>
      {profile === undefined ? (
        <ActivityIndicator color={colors.purple} style={styles.left} />
      ) : editing || profile === null ? (
        <ProfileForm
          initial={profile}
          onSaved={(p) => {
            setProfile(p);
            setEditing(false);
          }}
          onCancel={profile ? () => setEditing(false) : undefined}
        />
      ) : (
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.nickname.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nickname}>{profile.nickname}</Text>
            <View style={styles.row}>
              <SmallFlag iso={profile.country} />
              <Text style={styles.text}>{countryName(profile.country, language, t.countryOther)}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setEditing(true)} hitSlop={8}>
            <Text style={styles.link}>{t.edit}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.small}>{t.accountDevice}</Text>

      {profile && <Button label={t.deleteAccount} variant="ghost" onPress={confirmDelete} style={styles.left} />}
    </View>
  );
}

function SmallFlag({ iso }: { iso: string }) {
  const { styles } = useThemed();
  if (!BY_ISO.has(iso)) return null;
  return (
    <View style={styles.smallFlag}>
      <Flag iso={iso} width="100%" radius={3} />
    </View>
  );
}

function ProfileForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: Profile | null;
  onSaved: (p: Profile) => void;
  onCancel?: () => void;
}) {
  const { colors, styles } = useThemed();
  const { t, language } = useSettings();
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [country, setCountry] = useState(initial?.country ?? guessCountry);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Every country on the map, by name in the player's language, then Other.
  const sorted = useMemo(
    () => [...COUNTRIES].sort((a, b) => a[language].localeCompare(b[language], language)),
    [language],
  );
  const plain = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const matches = sorted.filter((c) => plain(c[language]).includes(plain(search.trim())));

  const save = async () => {
    const name = nickname.trim();
    if (!NICKNAME.test(name)) {
      setError(t.nicknameRule);
      return;
    }
    setSaving(true);
    setError(null);
    const free = name.toLowerCase() === initial?.nickname.toLowerCase() ? true : await isNicknameAvailable(name);
    const p = { nickname: name, country };
    const result = free === false ? 'taken' : await saveProfile(p);
    setSaving(false);
    if (result === 'saved') onSaved(p);
    else {
      const e = lastCloudError();
      setError(
        { taken: t.nicknameTaken, invalid: t.profileInvalid, offline: `${t.cloudFailed}${e ? `\n(${e})` : ''}` }[
          result
        ],
      );
    }
  };

  const choose = (iso: string) => {
    setCountry(iso);
    setPicking(false);
    setSearch('');
  };

  return (
    <View style={styles.form}>
      {!initial && <Text style={styles.text}>{t.accountIntro}</Text>}
      <Text style={styles.label}>{t.nickname}</Text>
      <TextInput
        value={nickname}
        onChangeText={setNickname}
        placeholder={t.nicknamePlaceholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        accessibilityLabel={t.nickname}
        style={styles.input}
      />
      <Text style={styles.label}>{t.countryLabel}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.countryLabel}: ${countryName(country, language, t.countryOther)}`}
        onPress={() => setPicking(!picking)}
        style={[styles.input, styles.select]}
      >
        <View style={styles.row}>
          <SmallFlag iso={country} />
          <Text style={styles.inputText}>{countryName(country, language, t.countryOther)}</Text>
        </View>
        <MaterialCommunityIcons name={picking ? 'chevron-up' : 'chevron-down'} size={22} color={colors.purpleSoft} />
      </Pressable>
      {picking && (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.countrySearch}
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            accessibilityLabel={t.countrySearch}
            style={styles.input}
          />
          <View style={styles.countries}>
            {matches.slice(0, 30).map((c) => (
              <CountryChip key={c.iso} label={c[language]} on={c.iso === country} onPress={() => choose(c.iso)} />
            ))}
            <CountryChip label={t.countryOther} on={country === OTHER} onPress={() => choose(OTHER)} />
          </View>
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.formButtons}>
        <Button label={saving ? t.saving : t.save} onPress={save} />
        {onCancel && <Button label={t.cancel} variant="ghost" onPress={onCancel} />}
      </View>
    </View>
  );
}

function CountryChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors, styles } = useThemed();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.country, on && styles.countryOn]}
    >
      <Text style={[styles.countryText, on && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
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
      gap: space(3),
    },
    cardTitle: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18 },
    text: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
    small: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
    link: { color: colors.purpleSoft, fontFamily: fonts.bold, fontSize: 15 },
    left: { alignSelf: 'flex-start', paddingHorizontal: 0, paddingVertical: space(2) },
    row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.purpleDeep,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space(1),
    },
    avatarText: { color: colors.text, fontFamily: fonts.heavy, fontSize: 22 },
    nickname: { color: colors.text, fontFamily: fonts.heavy, fontSize: 20 },
    smallFlag: { width: 24, height: 18, justifyContent: 'center' },
    form: { gap: space(2) },
    label: { color: colors.text, fontFamily: fonts.bold, fontSize: 14, marginTop: space(1) },
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
    inputText: { color: colors.text, fontFamily: fonts.regular, fontSize: 16 },
    select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    countries: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
    country: {
      paddingVertical: space(2),
      paddingHorizontal: space(3),
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
    },
    countryOn: { backgroundColor: colors.purpleDeep },
    countryText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 14 },
    error: { color: colors.wrong, fontFamily: fonts.bold, fontSize: 14 },
    formButtons: { gap: space(1), marginTop: space(2) },
  }),
}));
