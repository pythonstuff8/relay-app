import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { Colors } from '../constants/theme';
import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';

import { LanguageProvider } from '../context/LanguageContext';

export default function RootLayout() {
  // Give a subtle haptic bump when the app loads
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return (
    <LanguageProvider>
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'fade',
          }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="home" />
          <Stack.Screen name="standalone/index" />
          <Stack.Screen name="middleware/index" />
        </Stack>
      </View>
    </LanguageProvider>
  );
}
