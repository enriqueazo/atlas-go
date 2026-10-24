import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { LAND, MAP_HEIGHT, MAP_WIDTH, type Country } from '@/game/world';
import type { Mode } from '@/settings';
import { radius, useColors, type Palette } from '@/theme';

type Frame = { x: number; y: number; w: number; h: number };
export type MapStatus = 'ask' | 'right' | 'wrong';

type Props = {
  /** Country to zoom to; null shows the whole world. */
  focus: Country | null;
  mode: Mode;
  status: MapStatus;
};

const DURATION = 850;
/** One heartbeat of the glow around the asked country, and the spotlight fade-in. */
const PULSE = 1600;
const FADE = 500;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function frameFor(focus: Country | null, aspect: number): Frame {
  if (!focus) {
    const w = Math.max(MAP_WIDTH * 1.04, MAP_HEIGHT * 1.08 * aspect);
    return { x: MAP_WIDTH / 2 - w / 2, y: MAP_HEIGHT / 2 - w / aspect / 2, w, h: w / aspect };
  }
  const [bx, by, bw, bh] = focus.box;
  // Leave room around the country so its neighbours give context.
  const context = focus.tiny ? 130 : 110;
  const pad = Math.max(bw, bh) > 150 ? 1.35 : 2.2;
  const w = Math.min(Math.max(bw * pad, bh * pad * aspect, context), MAP_WIDTH * 1.04);
  const h = w / aspect;
  const [cx, cy] = focus.tiny ? focus.center : [bx + bw / 2, by + bh / 2];
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function WorldMap({ focus, mode, status }: Props) {
  const c = useColors();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const current = useRef<Frame | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ w: width, h: height });
  };

  // Fly from the current frame to the next: zoom in log scale and lift out a
  // little when the jump is long, like a camera hopping across the globe.
  useEffect(() => {
    if (!size) return;
    const to = frameFor(focus, size.w / size.h);
    const from = current.current;
    if (!from) {
      current.current = to;
      setFrame(to);
      return;
    }
    const fc = [from.x + from.w / 2, from.y + from.h / 2];
    const tc = [to.x + to.w / 2, to.y + to.h / 2];
    const dist = Math.hypot(tc[0] - fc[0], tc[1] - fc[1]);
    const lift = Math.min(dist / Math.max(from.w, to.w), 2.5) * 0.5;
    const aspect = size.w / size.h;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      const e = ease(t);
      const w = Math.min(
        from.w * Math.pow(to.w / from.w, e) * (1 + lift * Math.sin(Math.PI * e)),
        MAP_WIDTH * 1.2,
      );
      const h = w / aspect;
      const cx = fc[0] + (tc[0] - fc[0]) * e;
      const cy = fc[1] + (tc[1] - fc[1]) * e;
      const f = { x: cx - w / 2, y: cy - h / 2, w, h };
      current.current = f;
      setFrame(f);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focus, size]);

  const shape = useMemo(() => (focus ? LAND.find((l) => l.iso === focus.iso) : undefined), [focus]);

  // A slow heartbeat for the glow and rings while the question is open, and
  // the spotlight fading in as the camera lands.
  const asking = !!focus && status === 'ask';
  const [clock, setClock] = useState(0);
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
    setClock(0);
  }, [focus]);
  useEffect(() => {
    if (!asking) return;
    let raf = 0;
    let last = 0;
    const tick = () => {
      const now = Date.now();
      if (now - last > 32) {
        last = now;
        setClock(now - shownAt.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [asking]);

  // Map units per screen pixel, so strokes and markers keep their size.
  const px = frame && size ? frame.w / size.w : 1;
  const accent = status === 'right' ? c.green : status === 'wrong' ? c.wrong : c.highlight;
  const pulse = asking ? (1 - Math.cos((clock / PULSE) * 2 * Math.PI)) / 2 : 0;
  const dim = focus ? (asking ? Math.min(1, clock / FADE) : 1) * c.dimOpacity : 0;
  // Countries a few pixels wide on screen also get a ring, so they can't hide.
  const small = !!focus && (focus.tiny || Math.max(focus.box[2], focus.box[3]) / px < 26);
  const ring = focus && mode === 'countries' && small;
  const capital = focus?.capital && mode === 'capitals' ? focus.capital : null;

  return (
    <View style={[styles.card, { backgroundColor: c.ocean, borderColor: c.border }]} onLayout={onLayout}>
      {frame && (
        <Svg width="100%" height="100%" viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}>
          <Rect x={-MAP_WIDTH} y={-MAP_HEIGHT} width={MAP_WIDTH * 3} height={MAP_HEIGHT * 3} fill={c.ocean} />
          <Waves color={c.oceanDeep} px={px} />
          <G transform={`translate(0 ${2.5 * px})`}>
            <LandShadow c={c} />
          </G>
          <G stroke={c.landStroke} strokeWidth={1.1 * px} strokeLinejoin="round">
            <Land c={c} />
          </G>
          {/* Spotlight: wash out the rest of the world around the asked country. */}
          {dim > 0 && (
            <Rect
              x={-MAP_WIDTH}
              y={-MAP_HEIGHT}
              width={MAP_WIDTH * 3}
              height={MAP_HEIGHT * 3}
              fill={c.dim}
              fillOpacity={dim}
            />
          )}
          {shape && (
            <G strokeLinejoin="round">
              <Path
                d={shape.d}
                fill="none"
                stroke={accent}
                strokeOpacity={0.35 + 0.25 * pulse}
                strokeWidth={(9 + 5 * pulse) * px}
              />
              <Path
                d={shape.d}
                fill={accent}
                fillOpacity={mode === 'capitals' ? 0.75 : 1}
                stroke={c.highlightEdge}
                strokeWidth={2.4 * px}
              />
            </G>
          )}
          {ring && (
            <G>
              <Circle
                cx={focus.center[0]}
                cy={focus.center[1]}
                r={(18 + 8 * pulse) * px}
                fill="none"
                stroke={accent}
                strokeOpacity={0.6 - 0.4 * pulse}
                strokeWidth={3 * px}
              />
              <Circle
                cx={focus.center[0]}
                cy={focus.center[1]}
                r={15 * px}
                fill={accent}
                fillOpacity={0.2}
                stroke={c.highlightEdge}
                strokeWidth={2.5 * px}
              />
            </G>
          )}
          {capital && (
            <G>
              <Circle
                cx={capital.x}
                cy={capital.y}
                r={(13 + 7 * pulse) * px}
                fill={accent}
                fillOpacity={0.45 - 0.3 * pulse}
              />
              <Circle
                cx={capital.x}
                cy={capital.y}
                r={8 * px}
                fill={status === 'ask' ? c.marker : accent}
                stroke={c.markerEdge}
                strokeWidth={3 * px}
              />
            </G>
          )}
        </Svg>
      )}
    </View>
  );
}

// Little cartoon waves scattered over the open ocean.
const WAVES: [number, number][] = [
  [70, 240], [130, 330], [60, 120], [250, 300], [200, 400], [330, 430], [400, 210], [440, 310],
  [370, 360], [500, 430], [640, 300], [700, 370], [610, 420], [780, 410], [880, 300], [940, 200],
  [820, 250], [960, 380], [520, 20], [300, 20],
];
const WAVE = 'm-6 0q1.5 -2.5 3 0t3 0t3 0t3 0';

const Waves = memo(function Waves({ color, px }: { color: string; px: number }) {
  return (
    <G stroke={color} strokeWidth={Math.max(0.6, 2 * px)} strokeLinecap="round" fill="none">
      {WAVES.map(([x, y], i) => (
        <Path key={i} d={`M${x} ${y}${WAVE}`} />
      ))}
    </G>
  );
});

// The land layers only change with the theme, so they skip the per-frame
// re-render while the camera moves.
const LandShadow = memo(function LandShadow({ c }: { c: Palette }) {
  return (
    <G fill={c.landShadow}>
      {LAND.map((l, i) => (
        <Path key={i} d={l.d} />
      ))}
    </G>
  );
});

const Land = memo(function Land({ c }: { c: Palette }) {
  return (
    <G>
      {LAND.map((l, i) => (
        <Path key={i} d={l.d} fill={c.land[l.c]} />
      ))}
    </G>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
