import { Nunito_500Medium, Nunito_700Bold, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { syncWallet } from '@/cloud/wallet';
import { SettingsProvider, useSettings } from '@/settings';
import { PALETTES, ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Shown before fonts and saved settings are read, so it follows the phone. */
function Loading() {
  const colors = PALETTES[useColorScheme() === 'light' ? 'light' : 'dark'];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.purple} size="large" />
    </View>
  );
}

function Screens() {
  const { colors, scheme } = useTheme();
  const { ready } = useSettings();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Sends the hints and discards used offline and reads the wallet back, when
  // the app opens and each time it comes back to the front.
  useEffect(() => {
    syncWallet();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncWallet();
    });
    return () => sub.remove();
  }, []);

  if (!ready) return <Loading />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Nunito_500Medium, Nunito_700Bold, Nunito_800ExtraBold });
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SettingsProvider>{fontsLoaded ? <Screens /> : <Loading />}</SettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
