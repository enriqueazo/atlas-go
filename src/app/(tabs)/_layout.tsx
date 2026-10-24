import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router/js-tabs';
import { Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tabBarStyle } from '@/components/tabBar';
import { useSettings } from '@/settings';
import { fonts, useColors } from '@/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// Custom label: the default one clips Nunito's descenders.
function label(text: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontFamily: fonts.bold, fontSize: 12, marginTop: 2 }}>{text}</Text>
  );
}

function icon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={name} color={color as string} size={size} />
  );
}

export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.purpleSoft,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: tabBarStyle(colors, insets),
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.tabGame, tabBarLabel: label(t.tabGame), tabBarIcon: icon('gamepad-variant') }} />
      <Tabs.Screen name="ranking" options={{ title: t.tabRanking, tabBarLabel: label(t.tabRanking), tabBarIcon: icon('podium') }} />
      <Tabs.Screen name="settings" options={{ title: t.tabSettings, tabBarLabel: label(t.tabSettings), tabBarIcon: icon('cog') }} />
    </Tabs>
  );
}
