import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';

import { Card, Screen, Segmented, type IconName } from '@/components/ui';
import { useSettings } from '@/settings';
import { useSound } from '@/sounds';
import { space, themed, type, useTheme } from '@/theme';

export default function SettingsScreen() {
  const s = useStyles();
  const { t, theme, sound, lang, update } = useSettings();
  const play = useSound();

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{t.settingsTitle}</Text>

        <Section icon="theme-light-dark" title={t.appearance}>
          <Segmented
            value={theme}
            onChange={(v) => update({ theme: v })}
            options={[
              { value: 'system', label: t.themeSystem },
              { value: 'dark', label: t.themeDark },
              { value: 'light', label: t.themeLight },
            ]}
          />
        </Section>

        <Section icon="volume-high" title={t.sound}>
          <Segmented
            value={sound}
            onChange={(v) => {
              update({ sound: v });
            }}
            options={[
              { value: 'off', label: t.soundOff },
              { value: 'low', label: t.soundLow },
              { value: 'medium', label: t.soundMedium },
              { value: 'high', label: t.soundHigh },
            ]}
          />
        </Section>

        <Section icon="translate" title={t.language}>
          <Segmented
            value={lang}
            onChange={(v) => {
              play('tap');
              update({ lang: v });
            }}
            options={[
              { value: 'system', label: t.langSystem },
              { value: 'es', label: 'Español' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Section>

        <Text style={s.credits}>{t.credits}</Text>
      </ScrollView>
    </Screen>
  );
}

function Section({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Card>
      <View style={s.sectionHead}>
        <MaterialCommunityIcons name={icon} size={22} color={c.purpleSoft} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

const useStyles = themed((c) => ({
  body: { paddingTop: space(4), paddingBottom: space(10), gap: space(4) },
  title: { ...type.title, color: c.text, marginBottom: space(2) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  sectionTitle: { ...type.cardTitle, color: c.text },
  credits: { ...type.caption, color: c.textMuted, textAlign: 'center', marginTop: space(2) },
}));
