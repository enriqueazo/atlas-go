import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { playDuel } from '@/cloud/duels';
import { GameProblem, RankedGame } from '@/components/RankedGame';
import { Button } from '@/components/ui';
import { RANKED_DATA } from '@/data/ranked';
import { useSettings } from '@/settings';
import { space } from '@/theme';

// A player's game in a duel: the duel's ten questions, run by the server like
// a Ranked game. The result against the rival is on the duel's own screen.
export default function PlayDuel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useSettings();
  const toDuel = () => router.replace(`/duels/${id}`);
  return (
    <RankedGame
      title={t.duelTitle}
      icon="sword-cross"
      start={() => playDuel(RANKED_DATA, id)}
      problem={(code) =>
        t.duelError(code) ? (
          <View style={styles.problem}>
            <GameProblem code={code} title={t.duelError(code) as string} />
            <Button label={t.seeDuel} variant="ghost" onPress={toDuel} />
          </View>
        ) : (
          <GameProblem code={code} title={t.rankedUnavailable} />
        )
      }
      results={() => (
        <View style={styles.results}>
          <Button label={t.seeDuel} onPress={toDuel} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  problem: { flex: 1, paddingBottom: space(8) },
  results: { alignItems: 'center', gap: space(2), marginTop: space(2) },
});
