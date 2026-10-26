import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { failed, myLeague, startRankedGame } from '@/cloud/ranked';
import { GameProblem, RankedGame } from '@/components/RankedGame';
import { Button, Chip } from '@/components/ui';
import { RANKED_DATA } from '@/data/ranked';
import { clampTier } from '@/game/leagues';
import { useSettings } from '@/settings';
import { space } from '@/theme';

type Placing = { rank: number; of: number; tier: number };

// Ranked: the server picks each question, times it and keeps the score,
// which goes to the weekly league and the rankings.
export default function Ranked() {
  const { t } = useSettings();
  const [placing, setPlacing] = useState<Placing | null>(null);
  // Bumped by "Play again", to start a new game on a fresh screen.
  const [run, setRun] = useState(0);

  const start = async () => {
    setPlacing(null);
    return startRankedGame(RANKED_DATA);
  };

  return (
    <RankedGame
      key={run}
      title={t.modeRanked}
      icon="trophy-outline"
      start={start}
      problem={(code) => <GameProblem code={code} title={t.rankedUnavailable} />}
      results={() => <Results placing={placing} onLoad={setPlacing} onAgain={() => setRun((n) => n + 1)} />}
    />
  );
}

function Results({
  placing,
  onLoad,
  onAgain,
}: {
  placing: Placing | null;
  onLoad: (p: Placing) => void;
  onAgain: () => void;
}) {
  const { t } = useSettings();
  // Where the game left the player in this week's league.
  useEffect(() => {
    myLeague().then((league) => {
      if (failed(league)) return;
      const me = league.rows.find((r) => r.me);
      if (me) onLoad({ rank: me.rank, of: league.rows.length, tier: league.tier });
    });
  }, [onLoad]);
  return (
    <View style={styles.results}>
      {placing && <Chip label={t.leaguePlace(placing.rank, placing.of, t.tiers[clampTier(placing.tier)])} tone="purple" />}
      <Button label={t.playAgain} onPress={onAgain} />
      <Button label={t.seeRanking} variant="ghost" onPress={() => router.replace('/ranking')} />
    </View>
  );
}

const styles = StyleSheet.create({
  results: { alignItems: 'center', gap: space(2), marginTop: space(2) },
});
