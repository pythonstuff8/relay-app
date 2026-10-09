import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { BellRing } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Colors, Typography } from '../../constants/theme';
import { useBridge } from '../../context/BridgeContext';
import { sayPrompt, stopSpeaking } from '../../utils/speech';

export default function SoundAlertsScreen() {
  useKeepAwake();
  const { alerts, status, desktopName } = useBridge();
  const flash = useRef(new Animated.Value(0)).current;
  const latestId = alerts[0]?.id;
  const latestSeverity = alerts[0]?.severity;

  useEffect(() => {
    sayPrompt('Sound alerts. Keep this screen open. Your phone vibrates and flashes when your computer hears an important sound.');
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (!latestId) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 1400, useNativeDriver: false }).start();
  }, [latestId, flash]);

  const background = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.background, latestSeverity === 'high' ? Colors.error : Colors.modeMiddleware],
  });

  return (
    <Animated.View style={{ flex: 1, backgroundColor: background }}>
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Sound Alerts" icon={BellRing} color={Colors.error} />

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>
            {status === 'connected' ? `Listening through ${desktopName || 'your computer'}` : 'Computer not connected'}
          </Text>
          <Text style={styles.hint}>Urgent sounds vibrate three times. Others vibrate once.</Text>
        </View>

        <ScrollView contentContainerStyle={{ gap: 10, paddingVertical: 12 }}>
          {alerts.length === 0 ? (
            <Text style={styles.empty}>No alerts yet.</Text>
          ) : (
            alerts.map((alert) => (
              <View
                key={alert.id}
                style={[styles.alert, alert.severity === 'high' && styles.alertHigh]}
                accessible
                accessibilityLabel={`${alert.severity === 'high' ? 'Urgent: ' : ''}${alert.message}, ${new Date(alert.at).toLocaleTimeString()}`}
              >
                <Text style={styles.alertText}>{alert.message}</Text>
                <Text style={styles.alertTime}>{new Date(alert.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
            ))
          )}
        </ScrollView>

        <Pressable
          style={styles.testBtn}
          onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)}
          accessibilityRole="button"
          accessibilityLabel="Test vibration"
        >
          <Text style={styles.testText}>Test vibration</Text>
        </Pressable>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  statusBox: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  statusText: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '700' },
  hint: { color: Colors.textSubtle, fontSize: Typography.sizes.body, marginTop: 6 },
  empty: { color: Colors.textSubtle, fontSize: Typography.sizes.body, textAlign: 'center', marginTop: 24 },
  alert: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: Colors.glassSecondary,
    borderLeftWidth: 6,
    borderLeftColor: Colors.modeMiddleware,
  },
  alertHigh: { borderLeftColor: Colors.error, backgroundColor: 'rgba(255,59,48,0.15)' },
  alertText: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '700' },
  alertTime: { color: Colors.textSubtle, fontSize: Typography.sizes.body, marginTop: 4 },
  testBtn: {
    height: 60,
    borderRadius: 18,
    backgroundColor: Colors.glassPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  testText: { color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '700' },
});
