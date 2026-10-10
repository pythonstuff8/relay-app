import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Eye, Mic } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Colors, Typography } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { captureForAI, describeSurroundings } from '../../utils/ai';
import { ensureMicPermission } from '../../utils/audio';
import { startLiveCaptions, type LiveCaptionSession } from '../../utils/deepgram';
import { describeError } from '../../utils/relayApi';
import { sayPrompt, speakContent, stopSpeaking } from '../../utils/speech';

const IDLE_TEXT = 'HOLD TO ASK';

// One-tap questions for common daily tasks. Money and dates need high detail.
const QUICK_ASKS = [
  { label: 'Money', question: 'What bill or coin is this? Say the amount and currency.', detail: 'high' },
  { label: 'Color', question: 'What color is the main object or clothing item in front of me?', detail: 'low' },
  { label: 'Expiry date', question: 'Find the expiration or best-by date on this package and read it.', detail: 'high' },
  { label: 'Sign', question: 'Read the sign or label in front of me, including any numbers.', detail: 'high' },
  { label: 'Path ahead', question: 'Is my walking path ahead clear? Mention obstacles and where they are.', detail: 'low' },
] as const;

export default function BlindMode() {
  const { activeLang } = useLanguage();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const sessionRef = useRef<LiveCaptionSession | null>(null);
  const transcriptRef = useRef('');
  const holdingRef = useRef(false);
  const [isHolding, setIsHolding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState(IDLE_TEXT);
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) requestCameraPermission();
  }, [cameraPermission, requestCameraPermission]);

  useEffect(() => {
    ensureMicPermission().then(setMicGranted);
    sayPrompt('Blind mode. Point your phone ahead. Press and hold the lower part of the screen, ask your question, then let go.');
    return () => {
      stopSpeaking();
      sessionRef.current?.stop();
    };
  }, []);

  useFocusEffect(
    useCallback(() => () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    }, [])
  );

  const resetStatusSoon = () => setTimeout(() => setStatusText(IDLE_TEXT), 2000);

  const handlePressIn = async () => {
    if (isProcessing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    stopSpeaking();
    holdingRef.current = true;
    setIsHolding(true);
    setAnswer('');
    transcriptRef.current = '';
    setStatusText('LISTENING...');

    if (!micGranted) return; // Still works without voice: it answers "What is in front of me?"
    try {
      const session = await startLiveCaptions(activeLang.deepgram, {
        onTranscript: (text, isFinal) => {
          if (isFinal) transcriptRef.current = `${transcriptRef.current} ${text}`.trim();
        },
      });
      if (holdingRef.current) sessionRef.current = session;
      else session.stop();
    } catch {
      // Voice is optional; the photo is still described when released.
    }
  };

  const askPreset = async (question: string, detail: 'low' | 'high', label: string) => {
    if (isProcessing || holdingRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stopSpeaking();
    setIsProcessing(true);
    setAnswer('');
    try {
      setStatusText(label.toUpperCase());
      const photo = await captureForAI(cameraRef.current, detail === 'high' ? 1600 : 1024);
      setStatusText('THINKING...');
      const response = await describeSurroundings(photo, question, activeLang.openai, detail);
      setAnswer(response);
      setStatusText('ANSWER');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      speakContent(response, activeLang.tts);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = describeError(error);
      setAnswer(message);
      setStatusText('TRY AGAIN');
      sayPrompt(message);
    } finally {
      setIsProcessing(false);
      resetStatusSoon();
    }
  };

  const handlePressOut = async () => {
    if (!holdingRef.current || isProcessing) return;
    holdingRef.current = false;
    setIsHolding(false);
    setIsProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      setStatusText('LOOKING...');
      const photoPromise = captureForAI(cameraRef.current, 1024);
      // Give Deepgram a moment to return the last words.
      await new Promise((resolve) => setTimeout(resolve, 400));
      await sessionRef.current?.stop();
      sessionRef.current = null;

      const photo = await photoPromise;
      setStatusText('THINKING...');
      const response = await describeSurroundings(photo, transcriptRef.current, activeLang.openai);
      setAnswer(response);
      setStatusText('ANSWER');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      speakContent(response, activeLang.tts);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = describeError(error);
      setAnswer(message);
      setStatusText('TRY AGAIN');
      sayPrompt(message);
    } finally {
      setIsProcessing(false);
      resetStatusSoon();
    }
  };

  // Wait for the system prompt before showing the denied notice.
  if (!cameraPermission || (cameraPermission.status === 'undetermined' && cameraPermission.canAskAgain)) return <View style={styles.container} />;

  if (!cameraPermission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ paddingHorizontal: 16 }}>
          <ScreenHeader title="Blind Mode" icon={Eye} color={Colors.modeBlind} />
        </View>
        <PermissionNotice
          title="Camera access needed"
          message="Blind mode uses the camera to describe what is in front of you. Allow camera access in Settings."
          onRetry={cameraPermission.canAskAgain ? requestCameraPermission : undefined}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" mute animateShutter={false} />

      <SafeAreaView edges={['top']} style={styles.topRegion}>
        <ScreenHeader title="Blind Mode" icon={Eye} color={Colors.modeBlind} />
        {answer ? (
          <Text style={styles.answer} accessibilityLiveRegion="polite">
            {answer}
          </Text>
        ) : null}
        {micGranted === false ? (
          <Text style={styles.note}>Microphone is off, so Relay will describe what is in front of you.</Text>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {QUICK_ASKS.map((ask) => (
            <Pressable
              key={ask.label}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }, isProcessing && { opacity: 0.4 }]}
              onPress={() => askPreset(ask.question, ask.detail, ask.label)}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel={`Quick ask: ${ask.label}`}
              accessibilityHint={ask.question}
            >
              <Text style={styles.chipText}>{ask.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      <Pressable
        style={[styles.pttRegion, isHolding && styles.pttRegionActive, isProcessing && styles.pttRegionProcessing]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isProcessing}
        accessibilityRole="button"
        accessibilityLabel={`Ask about your surroundings, in ${activeLang.name}`}
        accessibilityHint="Press and hold, ask your question, then release. Relay answers out loud."
        accessibilityState={{ busy: isProcessing }}
      >
        <Mic color={isHolding ? Colors.error : Colors.white} size={64} style={{ marginBottom: 24, opacity: isProcessing ? 0.3 : 1 }} />
        <Text style={styles.statusText}>{statusText}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topRegion: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  answer: {
    color: Colors.white,
    fontSize: Typography.sizes.title3,
    fontWeight: '600',
    lineHeight: 30,
  },
  note: { color: Colors.textSubtle, fontSize: Typography.sizes.body, marginTop: 8 },
  chips: { gap: 10, paddingTop: 12 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: Colors.modeBlind,
  },
  chipText: { color: Colors.white, fontSize: Typography.sizes.body, fontWeight: '800' },
  pttRegion: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pttRegionActive: { backgroundColor: 'rgba(255,59,48,0.25)' },
  pttRegionProcessing: { backgroundColor: 'rgba(255,255,255,0.05)' },
  statusText: {
    color: Colors.white,
    fontSize: Typography.sizes.title2,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
});
