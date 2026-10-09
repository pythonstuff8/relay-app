import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/theme';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';
import { BridgeProvider } from '../context/BridgeContext';
import { ensurePlaybackAudioMode } from '../utils/audio';

// Every feature screen requires the data-sharing and safety consent, including
// screens opened directly through a relay:// link.
function ConsentGate() {
  const { ready, hasConsented } = useLanguage();
  const segments = useSegments();
  const router = useRouter();
  const first = segments[0] as string | undefined;

  useEffect(() => {
    if (!ready || hasConsented) return;
    if (first === undefined || first === 'index' || first === 'consent') return;
    router.replace('/consent');
  }, [ready, hasConsented, first, router]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    ensurePlaybackAudioMode();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return (
    <LanguageProvider>
      <BridgeProvider>
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <StatusBar style="light" />
          <ConsentGate />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.background },
              animation: 'fade',
            }}
          />
        </View>
      </BridgeProvider>
    </LanguageProvider>
  );
}
