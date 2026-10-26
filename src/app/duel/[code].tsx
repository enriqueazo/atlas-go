import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { joinDuel } from '@/cloud/duels';
import { failed } from '@/cloud/ranked';
import { Button, Screen } from '@/components/ui';
import { cleanCode } from '@/game/duels';
import { useSettings } from '@/settings';
import { fonts, space, themed } from '@/theme';

// Opened from a shared duel link (atlasgo://duel/K7MPQ2): takes the duel and
// goes to it.
export default function JoinDuel() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colors, styles } = useThemed();
  const { t } = useSettings();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = cleanCode(code ?? '');
    if (!c) {
      setError('duel_not_found');
      return;
    }
    joinDuel(c).then((r) => {
      if (failed(r)) setError(r.error);
      else router.replace(`/duels/${r.id}`);
    });
  }, [code]);

  return (
    <Screen>
      <View style={styles.center}>
        {error ? (
          <>
            <MaterialCommunityIcons name="sword-cross" size={56} color={colors.purpleSoft} />
            <Text style={styles.title}>{t.joinDuelFailed}</Text>
            <Text style={styles.text}>{t.duelError(error) ?? t.cloudError(error)}</Text>
            {error === 'profile_required' ? (
              <Button label={t.goSettings} onPress={() => router.replace('/settings')} />
            ) : (
              <Button label={t.seeDuels} variant="ghost" onPress={() => router.replace('/duels')} />
            )}
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.purple} />
            <Text style={styles.text}>{t.joiningDuel}</Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const useThemed = themed((colors) => ({
  colors,
  styles: StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(3), paddingHorizontal: space(4) },
    title: { color: colors.text, fontFamily: fonts.heavy, fontSize: 22, textAlign: 'center' },
    text: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  }),
}));
