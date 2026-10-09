import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { Volume2 } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Colors, Typography } from '../../constants/theme';
import { useLanguage, type Prefs } from '../../context/LanguageContext';
import { ensureMicPermission, pcm16Level, startMicStream, stopMicStream } from '../../utils/audio';
import { sayPrompt, stopSpeaking } from '../../utils/speech';

// On-device loudness detection: nothing leaves the phone.
const THRESHOLDS: Record<Prefs['loudSensitivity'], number> = { low: -12, medium: -20, high: -28 };
const COOLDOWN_MS = 3000;
const SENSITIVITY_LABELS: Record<Prefs['loudSensitivity'], string> = {
  low: 'Low: very loud sounds only',
  medium: 'Medium',
  high: 'High: quieter sounds too',
};

type Event = { id: number; at: number; level: number };

export default function LoudSoundScreen() {
  useKeepAwake();
  const { prefs, updatePrefs } = useLanguage();
  const [listening, setListening] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [level, setLevel] = useState(-100);
  const [events, setEvents] = useState<Event[]>([]);
  const flash = useRef(new Animated.Value(0)).current;
  const thresholdRef = useRef(THRESHOLDS[prefs.loudSensitivity]);
  const lastAlertRef = useRef(0);
  const lastLevelUpdateRef = useRef(0);
  const idRef = useRef(0);

  useEffect(() => {
    thresholdRef.current = THRESHOLDS[prefs.loudSensitivity];
  }, [prefs.loudSensitivity]);

  useEffect(() => {
    sayPrompt('Loud sound alert. Your phone will flash and vibrate when it hears a loud sound. Everything stays on your phone.');
    return () => stopSpeaking();
  }, []);

  const stop = useCallback(async () => {
    setListening(false);
    setLevel(-100);
    await stopMicStream();
  }, []);

  useFocusEffect(useCallback(() => () => { stop(); }, [stop]));

  const triggerAlert = useCallback((db: number) => {
    lastAlertRef.current = Date.now();
    setEvents((current) => [{ id: ++idRef.current, at: Date.now(), level: db }, ...current].slice(0, 20));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), 350);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), 700);
    flash.setValue(1);
    Animated.sequence([
      Animated.timing(flash, { toValue: 0.2, duration: 200, useNativeDriver: false }),
      Animated.timing(flash, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.timing(flash, { toValue: 0, duration: 900, useNativeDriver: false }),
    ]).start();
  }, [flash]);

  const start = async () => {
    const granted = await ensureMicPermission();
    if (!granted) {
      setMicDenied(true);
      return;
    }
    setMicDenied(false);
    try {
      await startMicStream((bytes) => {
        const db = pcm16Level(bytes);
        const now = Date.now();
        if (now - lastLevelUpdateRef.current > 150) {
          lastLevelUpdateRef.current = now;
          setLevel(db);
        }
        if (db >= thresholdRef.current && now - lastAlertRef.current > COOLDOWN_MS) triggerAlert(db);
      });
      setListening(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setListening(false);
      sayPrompt('Could not start the microphone.');
    }
  };

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (listening) stop();
    else start();
  };

  const meter = Math.max(0, Math.min(1, (level + 60) / 60));
  const thresholdPosition = Math.max(0, Math.min(1, (THRESHOLDS[prefs.loudSensitivity] + 60) / 60));
  const background = flash.interpolate({ inputRange: [0, 1], outputRange: [Colors.background, Colors.modeLoud] });

  return (
    <Animated.View style={[styles.flex, { backgroundColor: background }]}>
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Loud Sound Alert" icon={Volume2} color={Colors.modeLoud} textColor={Colors.onAccent} />

        {micDenied ? (
          <PermissionNotice
            title="Microphone access needed"
            message="Loud Sound Alert listens for loud sounds on your phone. Allow microphone access in Settings."
            onRetry={start}
          />
        ) : null}

        <View style={styles.meterBox} accessible accessibilityLabel={listening ? 'Listening for loud sounds' : 'Not listening'}>
          <View style={styles.meterTrack}>
            <View style={[styles.meterFill, { width: `${meter * 100}%` }]} />
            <View style={[styles.thresholdMark, { left: `${thresholdPosition * 100}%` }]} />
          </View>
          <Text style={styles.meterLabel}>{listening ? 'Listening...' : 'Paused'}</Text>
        </View>

        <Text style={styles.section} accessibilityRole="header">Sensitivity</Text>
        <View style={styles.chips}>
          {(Object.keys(THRESHOLDS) as Prefs['loudSensitivity'][]).map((key) => {
            const selected = prefs.loudSensitivity === key;
            return (
              <Pressable
                key={key}
                style={[styles.chip, selected && styles.chipOn]}
                onPress={() => {
                  Haptics.selectionAsync();
                  updatePrefs({ loudSensitivity: key });
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={SENSITIVITY_LABELS[key]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{key.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section} accessibilityRole="header">Recent alerts</Text>
        <ScrollView style={styles.events} contentContainerStyle={{ gap: 8 }}>
          {events.length === 0 ? (
            <Text style={styles.empty}>No loud sounds yet.</Text>
          ) : (
            events.map((event) => (
              <Text key={event.id} style={styles.event}>
                {`Loud sound at ${new Date(event.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`}
              </Text>
            ))
          )}
        </ScrollView>

        <Pressable
          style={[styles.toggleBtn, listening && styles.toggleBtnOn]}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop listening' : 'Start listening for loud sounds'}
          accessibilityState={{ selected: listening }}
        >
          <Text style={[styles.toggleText, !listening && { color: Colors.onAccent }]}>{listening ? 'STOP' : 'START LISTENING'}</Text>
        </Pressable>
        <Text style={styles.disclaimer}>Detects loudness, not specific sounds. Keep this screen open.</Text>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 16 },
  meterBox: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  meterTrack: {
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.glassTertiary,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', backgroundColor: Colors.modeLoud },
  thresholdMark: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: Colors.error },
  meterLabel: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  section: {
    color: Colors.textSubtle,
    fontSize: Typography.sizes.caption,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
  },
  chips: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.glassSecondary,
  },
  chipOn: { backgroundColor: Colors.white, borderColor: Colors.white },
  chipText: { color: Colors.white, fontWeight: '700', fontSize: Typography.sizes.body },
  chipTextOn: { color: Colors.onAccent },
  events: { flex: 1 },
  empty: { color: Colors.textSubtle, fontSize: Typography.sizes.body },
  event: { color: Colors.white, fontSize: Typography.sizes.body, padding: 12, borderRadius: 12, backgroundColor: Colors.glassSecondary },
  toggleBtn: {
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.modeLoud,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  toggleBtnOn: { backgroundColor: Colors.error },
  toggleText: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '900', letterSpacing: 2 },
  disclaimer: { color: Colors.textSubtle, textAlign: 'center', fontSize: Typography.sizes.caption, marginVertical: 8 },
});
