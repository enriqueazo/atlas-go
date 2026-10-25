import Svg, { Path } from 'react-native-svg';

import { SILHOUETTE_SIZE, SILHOUETTES } from '@/game/world';

/** A country's outline on its own: the Silhouette mode's question, and the country list's icons. */
export function Silhouette({ iso, color, size }: { iso: string; color: string; size: number | `${number}%` }) {
  const d = SILHOUETTES[iso];
  if (!d) return null;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SILHOUETTE_SIZE} ${SILHOUETTE_SIZE}`}>
      <Path d={d} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
