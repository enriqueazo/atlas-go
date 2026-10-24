import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, space, themed, type, useTheme } from '@/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Screen: glow at the top fading into bg by 45% height. */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LinearGradient
        colors={[c.glow, c.bg, c.bg]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={['top']} style={[{ flex: 1, paddingHorizontal: space(5) }, style]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  compact,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  compact?: boolean;
}) {
  const s = useStyles();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary ? s.buttonPrimary : s.buttonGhost,
        compact && { paddingHorizontal: space(6) },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
      ]}>
      <Text style={[type.button, primary ? s.buttonPrimaryText : s.buttonGhostText]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'neutral' | 'purple' | 'green';
  icon?: IconName;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const [bg, fg] =
    tone === 'purple' ? [c.tint, c.purpleSoft] : tone === 'green' ? [c.greenSoft, c.green] : [c.surfaceRaised, c.textMuted];
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      {icon && <MaterialCommunityIcons name={icon} size={14} color={fg} />}
      <Text style={[type.chip, { color: fg, fontVariant: ['tabular-nums'] }]}>{label}</Text>
    </View>
  );
}

/** The logo: a purple tile rotated −6° with a globe, like Vocablo's Ñ tile. */
export function Logo({ size = 64 }: { size?: number }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={[s.logo, { width: size, height: size, borderRadius: size * 0.34 }]}>
      <MaterialCommunityIcons name="earth" size={size * 0.56} color={c.onPurple} />
    </View>
  );
}

export function ModeCard({
  icon,
  title,
  description,
  footer,
  onPress,
}: {
  icon: IconName;
  title: string;
  description: string;
  footer?: ReactNode;
  onPress: () => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.modeCard, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={s.modeIcon}>
        <MaterialCommunityIcons name={icon} size={28} color={c.text} />
      </View>
      <View style={s.modeBody}>
        <Text style={[type.cardTitle, { color: c.text }]}>{title}</Text>
        <Text style={[type.small, { color: c.textMuted }]}>{description}</Text>
        {footer}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={28} color={c.purpleSoft} />
    </Pressable>
  );
}

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dimmed';

export function OptionCard({
  badge,
  label,
  state,
  onPress,
  disabled,
}: {
  badge: string;
  label: string;
  state: OptionState;
  onPress: () => void;
  disabled?: boolean;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const look = {
    idle: { card: null, badgeBg: c.surfaceRaised, badgeFg: c.purpleSoft },
    correct: { card: s.optionCorrect, badgeBg: c.green, badgeFg: c.bg },
    wrong: { card: s.optionWrong, badgeBg: c.wrong, badgeFg: c.bg },
    dimmed: { card: s.optionDimmed, badgeBg: c.surfaceRaised, badgeFg: c.textMuted },
  }[state];
  const glyph = state === 'correct' ? '✓' : state === 'wrong' ? '✕' : badge;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: state === 'correct' || state === 'wrong' }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.option, look.card, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[s.badge, { backgroundColor: look.badgeBg }]}>
        <Text style={[s.badgeText, { color: look.badgeFg }]}>{glyph}</Text>
      </View>
      <Text style={[type.option, s.optionText]}>{label}</Text>
    </Pressable>
  );
}

/** A row of pill choices for Settings. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[s.segment, active && { backgroundColor: c.purple }]}>
            <Text style={[type.label, { color: active ? c.onPurple : c.textMuted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  return <View style={[s.card, style]}>{children}</View>;
}

const useStyles = themed((c) => ({
  button: {
    borderRadius: radius.pill,
    paddingVertical: space(4),
    paddingHorizontal: space(8),
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: c.purple,
    shadowColor: c.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 6,
  },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonPrimaryText: { color: c.onPurple },
  buttonGhostText: { color: c.purpleSoft },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space(1),
    borderRadius: radius.pill,
    paddingVertical: space(1),
    paddingHorizontal: space(3),
  },
  logo: {
    backgroundColor: c.purple,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
    shadowColor: c.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(4),
    padding: space(5),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  modeIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: c.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBody: { flex: 1, gap: space(2), alignItems: 'flex-start' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    padding: space(4),
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  optionCorrect: { backgroundColor: c.greenSoft, borderColor: c.green },
  optionWrong: { backgroundColor: c.wrongSoft, borderColor: c.wrong },
  optionDimmed: { opacity: 0.45 },
  optionText: { flex: 1, color: c.text },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...type.label, fontFamily: type.button.fontFamily },
  segmented: {
    flexDirection: 'row',
    gap: space(1),
    padding: space(1),
    borderRadius: radius.pill,
    backgroundColor: c.surfaceRaised,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space(2),
    borderRadius: radius.pill,
  },
  card: {
    padding: space(5),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    gap: space(3),
  },
}));
