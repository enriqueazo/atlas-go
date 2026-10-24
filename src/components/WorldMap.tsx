import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type HostInstance,
  type LayoutChangeEvent,
} from 'react-native';
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
/** How far the player can zoom with a pinch, as frame widths in map units. */
const MIN_W = 40;
const MAX_W = MAP_WIDTH * 1.5;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function frameFor(focus: Country | null, aspect: number): Frame {
  if (!focus) {
    // The map wraps, so there is no empty margin to show: fill the card,
    // with a peek at the neighbouring copies on a tall card.
    const w = Math.min(MAP_WIDTH * 1.04, MAP_HEIGHT * 1.3 * aspect);
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

// The map wraps like a torus: past the right edge is the left edge, past the
// top is the bottom. Frames are kept with their centre on the base copy, and
// the world is drawn once per copy the frame overlaps.
const mod = (n: number, m: number) => ((n % m) + m) % m;

function wrap(f: Frame): Frame {
  const x = f.x + f.w / 2;
  const y = f.y + f.h / 2;
  return { ...f, x: f.x + mod(x, MAP_WIDTH) - x, y: f.y + mod(y, MAP_HEIGHT) - y };
}

/** Shift `to` by whole worlds so it is the copy closest to `from`. */
function nearest(to: Frame, from: Frame): Frame {
  const dx = from.x + from.w / 2 - (to.x + to.w / 2);
  const dy = from.y + from.h / 2 - (to.y + to.h / 2);
  return {
    ...to,
    x: to.x + Math.round(dx / MAP_WIDTH) * MAP_WIDTH,
    y: to.y + Math.round(dy / MAP_HEIGHT) * MAP_HEIGHT,
  };
}

function tilesFor(f: Frame): [number, number][] {
  const tiles: [number, number][] = [];
  for (let j = Math.floor(f.y / MAP_HEIGHT); j * MAP_HEIGHT < f.y + f.h; j++) {
    for (let i = Math.floor(f.x / MAP_WIDTH); i * MAP_WIDTH < f.x + f.w; i++) {
      tiles.push([i * MAP_WIDTH, j * MAP_HEIGHT]);
    }
  }
  return tiles;
}

type Touch = { x: number; y: number };
const touchesOf = (e: GestureResponderEvent): Touch[] =>
  Array.from(e.nativeEvent.touches ?? [], (t) => ({ x: t.pageX, y: t.pageY }));

export function WorldMap({ focus, mode, status }: Props) {
  const c = useColors();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const current = useRef<Frame | null>(null);
  const flight = useRef(0);
  const view = useRef<HostInstance>(null);
  // Page position of the map card, so a pinch zooms around the fingers.
  const origin = useRef({ x: 0, y: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const measure = () =>
    view.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      origin.current = { x: pageX ?? 0, y: pageY ?? 0 };
    });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ w: width, h: height });
    measure();
  };

  const show = (f: Frame) => {
    const wrapped = wrap(f);
    current.current = wrapped;
    setFrame(wrapped);
  };

  // Zoom so the frame is `w` wide, keeping the map point under the screen
  // point (sx, sy) of `start` under the screen point (ex, ey).
  const zoomed = (start: Frame, w: number, sx: number, sy: number, ex: number, ey: number): Frame => {
    const s = sizeRef.current!;
    w = Math.min(MAX_W, Math.max(MIN_W, w));
    const h = w / (s.w / s.h);
    const k0 = start.w / s.w;
    const k1 = w / s.w;
    return { x: start.x + sx * k0 - ex * k1, y: start.y + sy * k0 - ey * k1, w, h };
  };

  // Drag to move the camera anywhere, pinch to zoom. A new finger restarts
  // the gesture from where the camera is, so drag and pinch blend smoothly.
  const gesture = useRef<{ frame: Frame; touches: Touch[] } | null>(null);
  const responder = useMemo(() => {
    const begin = (e: GestureResponderEvent) => {
      cancelAnimationFrame(flight.current);
      const f = current.current;
      gesture.current = f ? { frame: f, touches: touchesOf(e) } : null;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        measure();
        begin(e);
      },
      onPanResponderMove: (e) => {
        const g = gesture.current;
        const touches = touchesOf(e);
        if (!g || !sizeRef.current || touches.length === 0) return;
        if (touches.length !== g.touches.length) return begin(e);
        const o = origin.current;
        if (touches.length === 1) {
          const k = g.frame.w / sizeRef.current.w;
          const [a, b] = [g.touches[0], touches[0]];
          show({ ...g.frame, x: g.frame.x - (b.x - a.x) * k, y: g.frame.y - (b.y - a.y) * k });
          return;
        }
        const [a0, a1] = g.touches;
        const [b0, b1] = touches;
        const d0 = Math.hypot(a1.x - a0.x, a1.y - a0.y);
        const d1 = Math.hypot(b1.x - b0.x, b1.y - b0.y);
        if (d0 < 1 || d1 < 1) return;
        show(
          zoomed(
            g.frame,
            (g.frame.w * d0) / d1,
            (a0.x + a1.x) / 2 - o.x,
            (a0.y + a1.y) / 2 - o.y,
            (b0.x + b1.x) / 2 - o.x,
            (b0.y + b1.y) / 2 - o.y,
          ),
        );
      },
      onPanResponderRelease: () => {
        gesture.current = null;
      },
      onPanResponderTerminate: () => {
        gesture.current = null;
      },
    });
  }, []);

  // On the web, the mouse wheel zooms around the pointer.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = view.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      const f = current.current;
      if (!f || !sizeRef.current) return;
      e.preventDefault();
      cancelAnimationFrame(flight.current);
      const r = node.getBoundingClientRect();
      const [x, y] = [e.clientX - r.left, e.clientY - r.top];
      show(zoomed(f, f.w * Math.exp(e.deltaY * 0.0015), x, y, x, y));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  // Fly from the current frame to the next: zoom in log scale and lift out a
  // little when the jump is long, like a camera hopping across the globe.
  useEffect(() => {
    if (!size) return;
    const from = current.current;
    if (!from) {
      show(frameFor(focus, size.w / size.h));
      return;
    }
    // Head for the nearest copy of the target, so the camera takes the short
    // way round (Alaska to Russia crosses the Pacific).
    const to = nearest(frameFor(focus, size.w / size.h), from);
    const fc = [from.x + from.w / 2, from.y + from.h / 2];
    const tc = [to.x + to.w / 2, to.y + to.h / 2];
    const dist = Math.hypot(tc[0] - fc[0], tc[1] - fc[1]);
    const lift = Math.min(dist / Math.max(from.w, to.w), 2.5) * 0.5;
    const aspect = size.w / size.h;
    const start = Date.now();
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
      // Wrapping only shifts the frame by whole worlds, so the flight path
      // (computed from the unwrapped ends) stays smooth.
      show({ x: cx - w / 2, y: cy - h / 2, w, h });
      if (t < 1) flight.current = requestAnimationFrame(tick);
    };
    flight.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(flight.current);
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

  const tiles = frame ? tilesFor(frame) : [];

  return (
    <View
      ref={view}
      style={[styles.card, Platform.OS === 'web' && styles.web, { backgroundColor: c.ocean, borderColor: c.border }]}
      onLayout={onLayout}
      {...responder.panHandlers}
    >
      {frame && (
        <Svg width="100%" height="100%" viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}>
          <Rect x={frame.x - 10} y={frame.y - 10} width={frame.w + 20} height={frame.h + 20} fill={c.ocean} />
          {tiles.map(([x, y]) => (
            <G key={`${x} ${y}`} transform={`translate(${x} ${y})`}>
              <Waves color={c.oceanDeep} px={px} />
              <G transform={`translate(0 ${2.5 * px})`}>
                <LandShadow c={c} />
              </G>
            </G>
          ))}
          {tiles.map(([x, y]) => (
            <G
              key={`${x} ${y}`}
              transform={`translate(${x} ${y})`}
              stroke={c.landStroke}
              strokeWidth={1.1 * px}
              strokeLinejoin="round"
            >
              <Land c={c} />
            </G>
          ))}
          {/* Spotlight: wash out the rest of the world around the asked country. */}
          {dim > 0 && (
            <Rect
              x={frame.x - 10}
              y={frame.y - 10}
              width={frame.w + 20}
              height={frame.h + 20}
              fill={c.dim}
              fillOpacity={dim}
            />
          )}
          {tiles.map(([x, y]) => (
            <G key={`${x} ${y}`} transform={`translate(${x} ${y})`}>
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
            </G>
          ))}
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
  // Keep the browser from scrolling or zooming the page while the map is
  // dragged or pinched.
  web: { touchAction: 'none', cursor: 'grab' } as object,
});
