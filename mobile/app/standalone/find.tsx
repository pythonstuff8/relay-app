import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { Search, Square } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Colors, Typography } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { captureStripsForAI, locateObject, type ObjectSighting } from '../../utils/ai';
import { describeError } from '../../utils/relayApi';
import { sayPrompt, speakContent, stopSpeaking } from '../../utils/speech';

const PRESETS = ['keys', 'phone', 'wallet', 'glasses', 'remote', 'water bottle'];
// One check about every 1.5 s stays well under the proxy's rate limit.
const CHECK_INTERVAL_MS = 1500;
const MAX_FAILURES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Hot/cold feedback: stronger and more taps the closer and more centered the object is.
async function pulseFor(sighting: ObjectSighting) {
  if (!sighting.found) {
    await Haptics.selectionAsync();
    return;
  }
  if (sighting.direction === 'center' && sighting.distance === 'near') {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return;
  }
  const style = sighting.distance === 'far' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy;
  const taps = sighting.direction === 'center' ? 3 : 2;
  for (let i = 0; i < taps; i++) {
    await Haptics.impactAsync(style);
    await sleep(110);
  }
}

function cueFor(sighting: ObjectSighting, target: string): string {
  if (!sighting.found) return '';
  if (sighting.direction === 'center' && sighting.distance === 'near') return `Found the ${target}. Right in front of you.`;
  const where = sighting.direction === 'center' ? 'Ahead' : sighting.direction === 'left' ? 'Turn left' : sighting.direction === 'right' ? 'Turn right' : 'Close';
  return sighting.hint ? `${where}. ${sighting.hint}` : where;
}

export default function FindObjectScreen() {
  useKeepAwake();
  const { activeLang } = useLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [target, setTarget] = useState('');
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState('Choose what to find, then tap Start.');
  const [last, setLast] = useState<ObjectSighting | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    sayPrompt('Find my object. Pick an object, then slowly sweep your phone around the room. Taps get stronger as you get closer.');
    return () => stopSpeaking();
  }, []);

  const stop = useCallback(() => {
    runRef.current += 1;
    setSearching(false);
  }, []);

  useFocusEffect(useCallback(() => () => stop(), [stop]));

  const start = async (what: string) => {
    const object = what.trim();
    if (!object) return;
    setTarget(object);
    const run = ++runRef.current;
    setSearching(true);
    setLast(null);
    setStatus(`Looking for ${object}. Sweep the phone slowly.`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    sayPrompt(`Looking for ${object}. Sweep slowly.`);

    let failures = 0;
    let misses = 0;
    let lastCue = '';
    while (runRef.current === run) {
      const started = Date.now();
      try {
        const strips = await captureStripsForAI(cameraRef.current);
        const sighting = await locateObject(strips, object, activeLang.openai);
        if (runRef.current !== run) break;
        failures = 0;
        setLast(sighting);
        pulseFor(sighting);
        const cue = cueFor(sighting, object);
        if (sighting.found) {
          misses = 0;
          setStatus(cue);
          // Only speak when the guidance changes, so it doesn't chatter.
          if (cue !== lastCue) speakContent(cue, activeLang.tts, 1.05);
          lastCue = cue;
          if (sighting.direction === 'center' && sighting.distance === 'near') {
            stop();
            break;
          }
        } else {
          misses += 1;
          lastCue = '';
          setStatus(`Not in view yet. Keep sweeping.`);
          if (misses % 5 === 0) sayPrompt('Not in view. Try lower, or another side of the room.');
        }
      } catch (error) {
        failures += 1;
        if (failures >= MAX_FAILURES) {
          const message = describeError(error);
          setStatus(message);
          sayPrompt(message);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          stop();
          break;
        }
      }
      const wait = CHECK_INTERVAL_MS - (Date.now() - started);
      if (wait > 0) await sleep(wait);
    }
  };

  if (!permission || (permission.status === 'undetermined' && permission.canAskAgain)) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ paddingHorizontal: 16 }}>
          <ScreenHeader title="Find My Object" icon={Search} color={Colors.modeBlind} />
        </View>
        <PermissionNotice
          title="Camera access needed"
          message="Find My Object uses the camera to look for the object. Allow camera access in Settings."
          onRetry={permission.canAskAgain ? requestPermission : undefined}
        />
      </SafeAreaView>
    );
  }

  const found = last?.found;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader title="Find My Object" icon={Search} color={Colors.modeBlind} />
      </View>

      <View style={[styles.cameraBox, found && styles.cameraFound]}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" mute animateShutter={false} />
        {found && last?.direction ? (
          <View
            style={[styles.marker, last.direction === 'left' ? { left: '12%' } : last.direction === 'right' ? { right: '12%' } : { alignSelf: 'center' }]}
            importantForAccessibility="no"
          />
        ) : null}
      </View>

      <Text style={styles.status} accessibilityLiveRegion="assertive">{status}</Text>

      {!searching ? (
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset}
              style={styles.chip}
              onPress={() => start(preset)}
              accessibilityRole="button"
              accessibilityLabel={`Find my ${preset}`}
            >
              <Text style={styles.chipText}>{preset}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.controls}>
        {searching ? (
          <Pressable style={[styles.mainBtn, styles.stopBtn]} onPress={stop} accessibilityRole="button" accessibilityLabel={`Stop looking for ${target}`}>
            <Square color={Colors.white} size={28} />
            <Text style={[styles.mainText, { color: Colors.white }]}>STOP</Text>
          </Pressable>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={target}
              onChangeText={setTarget}
              onSubmitEditing={() => start(target)}
              placeholder="Type an object"
              placeholderTextColor={Colors.textSubtle}
              returnKeyType="search"
              accessibilityLabel="Object to find"
            />
            <Pressable
              style={[styles.mainBtn, !target.trim() && styles.disabled]}
              disabled={!target.trim()}
              onPress={() => start(target)}
              accessibilityRole="button"
              accessibilityLabel="Start searching"
              accessibilityState={{ disabled: !target.trim() }}
            >
              <Search color={Colors.onAccent} size={26} />
              <Text style={styles.mainText}>START</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  cameraBox: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Colors.black,
    borderWidth: 3,
    borderColor: 'transparent',
    justifyContent: 'center',
  },
  cameraFound: { borderColor: Colors.success },
  marker: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 5,
    borderColor: Colors.success,
  },
  status: {
    color: Colors.white,
    fontSize: Typography.sizes.title3,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 16,
    marginVertical: 14,
    minHeight: 56,
  },
  chips: { gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  chipText: { color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  input: {
    flex: 1,
    height: 72,
    borderRadius: 22,
    paddingHorizontal: 18,
    color: Colors.white,
    fontSize: Typography.sizes.body,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  mainBtn: {
    width: 150,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.modeBlind,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stopBtn: { flex: 1, backgroundColor: Colors.error },
  mainText: { color: Colors.onAccent, fontSize: Typography.sizes.title3, fontWeight: '900', letterSpacing: 2 },
  disabled: { opacity: 0.4 },
});
