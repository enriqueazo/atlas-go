import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { CLOUD_READY, SUPABASE } from './config';

// One client for the whole app, or none while no Supabase project is set up
// (src/cloud/config.ts). On phones the session is kept in AsyncStorage, next
// to the stats; on web, in the browser's localStorage.
export const supabase: SupabaseClient | null = CLOUD_READY
  ? createClient(SUPABASE.url, SUPABASE.key, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Refresh the session only while the app is open, as Supabase recommends for
// React Native.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
