import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Nunito_500Medium,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { Tabs } from 'expo-router/js-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SettingsProvider, useSettings } from '@/settings';
import { tabBarStyle, type, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Nunito_500Medium, Nunito_700Bold, Nunito_800ExtraBold });
  return (
    <SafeAreaProvider>
      <SettingsProvider>{fontsLoaded ? <AppTabs /> : null}</SettingsProvider>
    </SafeAreaProvider>
  );
}

function AppTabs() {
  const { c, name } = useTheme();
  const { t, ready } = useSettings();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: c.bg },
          tabBarStyle: tabBarStyle(c),
          tabBarActiveTintColor: c.purpleSoft,
          tabBarInactiveTintColor: c.textMuted,
          tabBarLabelStyle: { fontFamily: type.chip.fontFamily, fontSize: type.chip.fontSize },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: t.tabGame,
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="gamepad-variant" color={color as string} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="ranking"
          options={{
            title: t.tabRanking,
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="podium" color={color as string} size={size} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t.tabSettings,
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cog" color={color as string} size={size} />,
          }}
        />
      </Tabs>
    </>
  );
}
