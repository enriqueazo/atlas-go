import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { adPrivacyRequired, openAdPrivacy } from '@/ads/ads';
import { AccountCard } from '@/components/AccountCard';
import { Button, Screen } from '@/components/ui';
import type { Lang } from '@/i18n';
import { useSettings, type Volume } from '@/settings';
import { useSound } from '@/sounds';
import { fonts, radius, space, themed, useTheme, type Scheme } from '@/theme';

// Laid out like Vocablo's Ajustes: one card per setting, a switch for
// "Automático" and a segmented choice below it.
export default function Settings() {
  const { styles } = useThemed();
  const { t } = useSettings();

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t.settingsTitle}</Text>

          <AccountCard />

          <Appearance />

          <Sounds />

          <Language />

          <AdPrivacy />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t.creditsTitle}</Text>
            <Text style={styles.text}>{t.credits}</Text>
            <Text style={styles.link} onPress={() => Linking.openURL('https://www.naturalearthdata.com/')}>
              {t.creditsLink}
            </Text>
          </View>

          <Text style={styles.version}>{t.version(Constants.expoConfig?.version ?? '1.0.0')}</Text>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

/** Google's consent form again, where the law asks for one (the EU and the UK), as in Vocablo. */
function AdPrivacy() {
  const { styles } = useThemed();
  const { t } = useSettings();
  const [required, setRequired] = useState(false);
  useEffect(() => {
    adPrivacyRequired().then(setRequired);
  }, []);
  if (!required) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t.adPrivacyTitle}</Text>
      <Text style={styles.text}>{t.adPrivacyBody}</Text>
      <Button label={t.adPrivacyChange} variant="ghost" onPress={openAdPrivacy} style={styles.left} />
    </View>
  );
}

/** Light or dark: follows the phone ("Automático"), or one picked by hand. */
function Appearance() {
  const { colors, styles } = useThemed();
  const { setting, setSetting, scheme } = useTheme();
  const { t } = useSettings();
  const auto = setting === 'system';
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t.appearance}</Text>
      <AutoSwitch
        label={t.appearance}
        text={t.appearanceAuto}
        value={auto}
        onChange={(on) => setSetting(on ? 'system' : scheme)}
      />
      {!auto && (
        <View style={styles.segment}>
          {(['light', 'dark'] as Scheme[]).map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityState={{ selected: setting === s }}
              onPress={() => setSetting(s)}
              style={[styles.segmentItem, setting === s && styles.segmentOn]}
            >
              <Text style={[styles.segmentText, setting === s && { color: colors.text }]}>
                {s === 'light' ? t.themeLight : t.themeDark}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** How loud the sound effects are, or none at all. */
function Sounds() {
  const { colors, styles } = useThemed();
  const { t, sound, update } = useSettings();
  const labels: Record<Volume, string> = { off: t.soundOff, low: t.soundLow, medium: t.soundMedium, high: t.soundHigh };
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t.sound}</Text>
      <Text style={styles.text}>{t.soundText}</Text>
      <View style={styles.segment}>
        {(Object.keys(labels) as Volume[]).map((v) => (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityLabel={t.volume(labels[v])}
            accessibilityState={{ selected: sound === v }}
            onPress={() => update({ sound: v })}
            style={[styles.segmentItem, sound === v && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, sound === v && { color: colors.text }]}>{labels[v]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Spanish or English: follows the phone ("Automático"), or one picked by hand. */
function Language() {
  const { colors, styles } = useThemed();
  const { t, lang, language, update } = useSettings();
  const play = useSound();
  const auto = lang === 'system';
  const pick = (l: 'system' | Lang) => {
    play('tap');
    update({ lang: l });
  };
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t.language}</Text>
      <AutoSwitch
        label={t.language}
        text={t.languageAuto}
        value={auto}
        onChange={(on) => pick(on ? 'system' : language)}
      />
      {!auto && (
        <View style={styles.segment}>
          {(['es', 'en'] as Lang[]).map((l) => (
            <Pressable
              key={l}
              accessibilityRole="button"
              accessibilityState={{ selected: lang === l }}
              onPress={() => pick(l)}
              style={[styles.segmentItem, lang === l && styles.segmentOn]}
            >
              <Text style={[styles.segmentText, lang === l && { color: colors.text }]}>
                {l === 'es' ? 'Español' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function AutoSwitch({
  label,
  text,
  value,
  onChange,
}: {
  label: string;
  text: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{t.auto}</Text>
        <Text style={styles.text}>{text}</Text>
      </View>
      <Switch
        accessibilityLabel={`${label}: ${t.auto}`}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.purple }}
        thumbColor={colors.onPurple}
        ios_backgroundColor={colors.border}
        // react-native-web paints the thumb teal unless told otherwise.
        {...({ activeThumbColor: colors.onPurple } as object)}
      />
    </View>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    safe: { flex: 1 },
    body: { paddingVertical: space(6), gap: space(4) },
    title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 32, marginBottom: space(1) },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(5),
      gap: space(2),
    },
    cardTitle: { color: colors.text, fontFamily: fonts.heavy, fontSize: 18 },
    text: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
    link: { color: colors.purpleSoft, fontFamily: fonts.bold, fontSize: 15, marginTop: space(1) },
    label: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      padding: space(1),
      marginTop: space(1),
    },
    segmentItem: { flex: 1, alignItems: 'center', paddingVertical: space(2), borderRadius: radius.pill },
    segmentOn: { backgroundColor: colors.surface },
    segmentText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 14 },
    left: { alignSelf: 'flex-start', marginTop: space(1) },
    version: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  }),
}));
