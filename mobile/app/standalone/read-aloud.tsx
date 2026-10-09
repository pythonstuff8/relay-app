import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { BookOpenText, RotateCcw, ScanText, Square } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Colors, Typography } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { captureForAI, readTextInImage } from '../../utils/ai';
import { describeError } from '../../utils/relayApi';
import { sayPrompt, speakContent, stopSpeaking } from '../../utils/speech';

export default function ReadAloudScreen() {
  const { activeLang } = useLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('Point the camera at text, then tap Read.');

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    sayPrompt('Read aloud. Hold your phone about a foot above the text. The Read button fills the bottom of the screen.');
    return () => stopSpeaking();
  }, []);

  const read = async () => {
    if (busy) return;
    setBusy(true);
    stopSpeaking();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setStatus('Reading...');
    try {
      const photo = await captureForAI(cameraRef.current, 1600);
      const result = await readTextInImage(photo, activeLang.openai);
      setText(result);
      setStatus('Done. Tap Repeat to hear it again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      speakContent(result, activeLang.tts, 0.95);
    } catch (error) {
      const message = describeError(error);
      setStatus(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      sayPrompt(message);
    } finally {
      setBusy(false);
    }
  };

  // Wait for the system prompt before showing the denied notice.
  if (!permission || (permission.status === 'undetermined' && permission.canAskAgain)) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ paddingHorizontal: 16 }}>
          <ScreenHeader title="Read Aloud" icon={BookOpenText} color={Colors.modeRead} textColor={Colors.onAccent} />
        </View>
        <PermissionNotice
          title="Camera access needed"
          message="Read Aloud uses the camera to see the text you want read. Allow camera access in Settings."
          onRetry={permission.canAskAgain ? requestPermission : undefined}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader title="Read Aloud" icon={BookOpenText} color={Colors.modeRead} textColor={Colors.onAccent} />
      </View>

      <View style={styles.cameraBox}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" mute animateShutter={false} />
      </View>

      <ScrollView style={styles.textBox} contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
        {text ? <Text style={styles.result} selectable>{text}</Text> : null}
      </ScrollView>

      <View style={styles.controls}>
        <Pressable
          style={[styles.secondaryBtn, !text && styles.disabled]}
          disabled={!text}
          onPress={() => speakContent(text, activeLang.tts, 0.95)}
          accessibilityRole="button"
          accessibilityLabel="Repeat"
          accessibilityState={{ disabled: !text }}
        >
          <RotateCcw color={Colors.white} size={26} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.readBtn, pressed && { opacity: 0.85 }, busy && styles.disabled]}
          onPress={read}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Read the text in front of the camera"
          accessibilityState={{ busy }}
        >
          <ScanText color={Colors.onAccent} size={32} />
          <Text style={styles.readText}>{busy ? 'READING...' : 'READ'}</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={stopSpeaking}
          accessibilityRole="button"
          accessibilityLabel="Stop speaking"
        >
          <Square color={Colors.white} size={24} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  cameraBox: {
    height: '38%',
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Colors.black,
  },
  textBox: {
    flex: 1,
    margin: 16,
    borderRadius: 20,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  status: { color: Colors.textSubtle, fontSize: Typography.sizes.body, marginBottom: 8 },
  result: { color: Colors.white, fontSize: Typography.sizes.title3, lineHeight: 32 },
  controls: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  readBtn: {
    flex: 1,
    height: 88,
    borderRadius: 24,
    backgroundColor: Colors.modeRead,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  readText: { color: Colors.onAccent, fontSize: Typography.sizes.title2, fontWeight: '900', letterSpacing: 2 },
  secondaryBtn: {
    width: 72,
    height: 88,
    borderRadius: 24,
    backgroundColor: Colors.glassPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
