import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { MoonStar, Siren } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Colors, Typography } from '../../constants/theme';
import { useBridge } from '../../context/BridgeContext';
import { sayPrompt, stopSpeaking } from '../../utils/speech';

// Night Guard: leave the phone on the nightstand. When the paired computer hears
// a smoke alarm, siren, or other emergency sound, the flashlight and screen
// strobe and the phone vibrates until the user wakes up and taps the screen.
//
// One flash per second (1 Hz) stays well under the WCAG 2.3.1 limit of three
// flashes per second.
const STROBE_HALF_PERIOD_MS = 500;
const ALARM_TIMEOUT_MS = 3 * 60 * 1000;

export default function NightGuardScreen() {
  useKeepAwake();
  const { alerts, status, desktopName } = useBridge();
  const [permission, requestPermission] = useCameraPermissions();
  const [alarm, setAlarm] = useState<string | null>(null);
  const [lit, setLit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const seenIdRef = useRef(alerts[0]?.id ?? 0);
  const connected = status === 'connected';
  const torchAvailable = Boolean(permission?.granted);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    sayPrompt('Night guard is on. Leave this screen open on your nightstand. If your computer hears a smoke alarm, your phone flashes and vibrates.');
    return () => stopSpeaking();
  }, []);

  const dismiss = useCallback(() => {
    setAlarm(null);
    setLit(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  useFocusEffect(useCallback(() => () => setAlarm(null), []));

  // React to new alerts from the computer.
  const latest = alerts[0];
  useEffect(() => {
    if (!latest || latest.id <= seenIdRef.current) return;
    seenIdRef.current = latest.id;
    if (latest.severity === 'high') {
      setAlarm(latest.message);
    } else {
      setNotice(`${latest.message} · ${new Date(latest.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    }
  }, [latest]);

  // Strobe and vibrate while the alarm is active.
  useEffect(() => {
    if (!alarm) return;
    let on = false;
    const strobe = setInterval(() => {
      on = !on;
      setLit(on);
      if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }, STROBE_HALF_PERIOD_MS);
    const timeout = setTimeout(() => setAlarm(null), ALARM_TIMEOUT_MS);
    return () => {
      clearInterval(strobe);
      clearTimeout(timeout);
      setLit(false);
    };
  }, [alarm]);

  if (alarm) {
    return (
      <Pressable
        style={[styles.alarm, { backgroundColor: lit ? Colors.white : Colors.error }]}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={`Emergency: ${alarm}. Tap anywhere to stop the alarm.`}
      >
        {torchAvailable ? <CameraView style={styles.hiddenCamera} facing="back" enableTorch={lit} mute /> : null}
        <Siren color={lit ? Colors.error : Colors.white} size={120} />
        <Text style={[styles.alarmTitle, { color: lit ? Colors.error : Colors.white }]}>{alarm.toUpperCase()}</Text>
        <Text style={[styles.alarmHint, { color: lit ? Colors.black : Colors.white }]}>Tap anywhere when you are awake</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Night Guard" icon={MoonStar} color={Colors.modeMiddleware} textColor={Colors.onAccent} />

      <View style={styles.center} accessible accessibilityLiveRegion="polite">
        <MoonStar color={connected ? Colors.modeMiddleware : Colors.textSubtle} size={96} />
        <Text style={styles.title}>{connected ? 'Guarding' : 'Computer not connected'}</Text>
        <Text style={styles.body}>
          {connected
            ? `${desktopName || 'Your computer'} is listening. If it hears a smoke alarm or siren, this phone flashes and vibrates.`
            : 'Night Guard needs Relay running on your computer with sound alerts on. It reconnects automatically.'}
        </Text>
        {notice ? <Text style={styles.notice}>{`Last sound: ${notice}`}</Text> : null}
        {!torchAvailable ? (
          <Text style={styles.warning}>Allow camera access to use the flashlight. The screen and vibration still work without it.</Text>
        ) : null}
      </View>

      <Text style={styles.disclaimer}>
        Keep the screen open and the phone charging. Night Guard adds to your smoke alarms; it does not replace them.
      </Text>

      <Pressable
        style={styles.testBtn}
        onPress={() => setAlarm('Test alarm')}
        accessibilityRole="button"
        accessibilityLabel="Test the alarm"
        accessibilityHint="Flashes and vibrates until you tap the screen"
      >
        <Siren color={Colors.white} size={24} />
        <Text style={styles.testText}>Test alarm</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  title: { color: Colors.white, fontSize: Typography.sizes.title1, fontWeight: '800', marginTop: 20 },
  body: { color: Colors.textSubtle, fontSize: Typography.sizes.body, textAlign: 'center', marginTop: 10, lineHeight: 24 },
  notice: { color: Colors.white, fontSize: Typography.sizes.body, marginTop: 18, fontWeight: '600' },
  warning: { color: Colors.warning, fontSize: Typography.sizes.caption, textAlign: 'center', marginTop: 14, lineHeight: 18 },
  disclaimer: { color: Colors.textSubtle, fontSize: Typography.sizes.caption, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
  testBtn: {
    height: 60,
    borderRadius: 18,
    backgroundColor: Colors.glassPrimary,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  testText: { color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '700' },
  alarm: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // The torch needs an active camera session; keep the preview out of sight.
  hiddenCamera: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  alarmTitle: { fontSize: 40, fontWeight: '900', textAlign: 'center', marginTop: 24, letterSpacing: 1 },
  alarmHint: { fontSize: Typography.sizes.title3, fontWeight: '700', marginTop: 20, textAlign: 'center' },
});
