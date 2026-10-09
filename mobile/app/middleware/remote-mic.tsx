import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { Mic, MicOff } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Colors, Typography } from '../../constants/theme';
import { useBridge, type BridgeMessage } from '../../context/BridgeContext';
import { ensureMicPermission, MIC_SAMPLE_RATE, pcm16Level, startMicStream, stopMicStream } from '../../utils/audio';
import { sayPrompt, stopSpeaking } from '../../utils/speech';

type MicState = 'idle' | 'starting' | 'streaming';

const REJECTION_MESSAGES: Record<string, string> = {
  busy: 'Another phone is already the Remote Mic for this computer.',
  captions_unavailable: 'Your computer could not start captions. Check its internet connection.',
  unsupported_format: 'Your computer could not use this audio format. Update Relay on your computer.',
  unsupported_encoding: 'Your computer could not use this audio format. Update Relay on your computer.',
};

export default function RemoteMicScreen() {
  useKeepAwake();
  const { status, desktopName, sendJson, sendBinary, addListener, captions, interimCaption } = useBridge();
  const [micState, setMicState] = useState<MicState>('idle');
  const [micDenied, setMicDenied] = useState(false);
  const [level, setLevel] = useState(-100);
  const [message, setMessage] = useState('');
  const micStateRef = useRef<MicState>('idle');
  const lastLevelRef = useRef(0);
  const connected = status === 'connected';

  const setState = (next: MicState) => {
    micStateRef.current = next;
    setMicState(next);
  };

  const stopStreaming = useCallback(async (notifyDesktop = true) => {
    const wasActive = micStateRef.current !== 'idle';
    micStateRef.current = 'idle';
    setMicState('idle');
    setLevel(-100);
    await stopMicStream();
    if (wasActive && notifyDesktop) sendJson({ type: 'AUDIO_STOP' });
  }, [sendJson]);

  useEffect(() => {
    sayPrompt('Remote mic. Place your phone near the person speaking, then tap Start. Captions appear on your computer and here.');
    return () => stopSpeaking();
  }, []);

  useFocusEffect(useCallback(() => () => { stopStreaming(); }, [stopStreaming]));

  // Stop if the computer goes away.
  useEffect(() => {
    if (!connected && micStateRef.current !== 'idle') {
      stopStreaming(false);
      setMessage('Connection to your computer was lost.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [connected, stopStreaming]);

  useEffect(() => addListener(async (msg: BridgeMessage) => {
    if (msg.type === 'AUDIO_ACK' && micStateRef.current === 'starting') {
      try {
        await startMicStream((bytes) => {
          if (micStateRef.current !== 'streaming') return;
          sendBinary(bytes.buffer as ArrayBuffer);
          const now = Date.now();
          if (now - lastLevelRef.current > 150) {
            lastLevelRef.current = now;
            setLevel(pcm16Level(bytes));
          }
        });
        setState('streaming');
        setMessage('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        sayPrompt('Remote mic is on.');
      } catch {
        sendJson({ type: 'AUDIO_STOP' });
        setState('idle');
        setMessage('Could not start the microphone.');
      }
    } else if (msg.type === 'AUDIO_REJECTED') {
      setState('idle');
      const reason = String(msg.reason || '');
      setMessage(REJECTION_MESSAGES[reason] || 'Your computer could not start Remote Mic.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }), [addListener, sendBinary, sendJson]);

  const start = async () => {
    const granted = await ensureMicPermission();
    if (!granted) {
      setMicDenied(true);
      return;
    }
    setMicDenied(false);
    setMessage('Starting...');
    setState('starting');
    const sent = sendJson({ type: 'AUDIO_START', sampleRate: MIC_SAMPLE_RATE, encoding: 'linear16', channels: 1 });
    if (!sent) {
      setState('idle');
      setMessage('Computer not connected.');
      return;
    }
    setTimeout(() => {
      if (micStateRef.current === 'starting') {
        setState('idle');
        setMessage('Your computer did not answer. Make sure Relay is open on it.');
      }
    }, 12000);
  };

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (micStateRef.current === 'idle') start();
    else {
      stopStreaming();
      sayPrompt('Remote mic is off.');
    }
  };

  const meter = Math.max(0, Math.min(1, (level + 60) / 60));
  const lastCaptions = captions.slice(-4);
  const streaming = micState === 'streaming';

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Remote Mic" icon={Mic} color={Colors.success} textColor={Colors.onAccent} />

      {micDenied ? (
        <PermissionNotice
          title="Microphone access needed"
          message="Remote Mic sends your phone's microphone to your computer for captions. Allow microphone access in Settings."
          onRetry={start}
        />
      ) : null}

      <View style={styles.statusBox}>
        <Text style={styles.statusText}>
          {connected
            ? streaming
              ? `Sending audio to ${desktopName || 'your computer'}`
              : `Connected to ${desktopName || 'your computer'}`
            : 'Computer not connected'}
        </Text>
        <View style={styles.meterTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.meterFill, { width: `${meter * 100}%` }]} />
        </View>
        {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
      </View>

      <Text style={styles.section} accessibilityRole="header">Captions from your computer</Text>
      <ScrollView style={styles.captionBox} contentContainerStyle={{ padding: 16, gap: 8 }}>
        {lastCaptions.length === 0 && !interimCaption ? (
          <Text style={styles.empty}>Captions will appear here once people start talking.</Text>
        ) : null}
        {lastCaptions.map((caption) => (
          <Text key={caption.id} style={styles.caption}>{caption.text}</Text>
        ))}
        {interimCaption ? <Text style={[styles.caption, { opacity: 0.6 }]}>{interimCaption}</Text> : null}
      </ScrollView>

      <Pressable
        style={[styles.toggleBtn, streaming && styles.toggleBtnOn, (!connected || micState === 'starting') && styles.disabled]}
        onPress={toggle}
        disabled={!connected || micState === 'starting'}
        accessibilityRole="button"
        accessibilityLabel={streaming ? 'Stop Remote Mic' : 'Start Remote Mic'}
        accessibilityState={{ selected: streaming, disabled: !connected, busy: micState === 'starting' }}
      >
        {streaming ? <MicOff color={Colors.white} size={32} /> : <Mic color={Colors.onAccent} size={32} />}
        <Text style={[styles.toggleText, !streaming && { color: Colors.onAccent }]}>
          {streaming ? 'STOP' : micState === 'starting' ? 'STARTING...' : 'START REMOTE MIC'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  statusBox: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
    gap: 14,
  },
  statusText: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '700' },
  meterTrack: { height: 20, borderRadius: 10, backgroundColor: Colors.glassTertiary, overflow: 'hidden' },
  meterFill: { height: '100%', backgroundColor: Colors.success },
  message: { color: Colors.warning, fontSize: Typography.sizes.body },
  section: {
    color: Colors.textSubtle,
    fontSize: Typography.sizes.caption,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  captionBox: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: Colors.glassTertiary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  empty: { color: Colors.textSubtle, fontSize: Typography.sizes.body },
  caption: { color: Colors.white, fontSize: Typography.sizes.title3, lineHeight: 30 },
  toggleBtn: {
    height: 84,
    borderRadius: 26,
    backgroundColor: Colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 12,
  },
  toggleBtnOn: { backgroundColor: Colors.error },
  toggleText: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '900', letterSpacing: 1 },
  disabled: { opacity: 0.45 },
});
