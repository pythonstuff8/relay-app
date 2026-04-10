import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { ExpoPlayAudioStream, Subscription } from '@saltmango/expo-audio-stream';
import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, Mic } from 'lucide-react-native';
import { Colors, Typography } from '../../constants/theme';
import { navigateWithAI } from '../../utils/api';
import { useLanguage } from '../../context/LanguageContext';

export default function BlindMode() {
  const router = useRouter();
  const { activeLang } = useLanguage();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [audioPermission, requestAudioPermission] = Audio.usePermissions();

  const cameraRef = useRef<CameraView>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('HOLD BOTTOM AREA TO ASK');

  const wsRef = useRef<WebSocket | null>(null);
  const subRef = useRef<Subscription | null>(null);
  const navTranscriptRef = useRef<string>('');

  useEffect(() => {
    if (!cameraPermission?.granted) requestCameraPermission();
    if (!audioPermission?.granted) requestAudioPermission();
  }, [cameraPermission?.granted, audioPermission?.granted, requestCameraPermission, requestAudioPermission]);

  const handleBack = () => {
    Haptics.selectionAsync();
    Speech.stop();
    router.back();
  };

  const handlePressIn = async () => {
    if (isProcessing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Speech.stop();
    setIsHolding(true);
    setStatusText('CONNECTING...');
    navTranscriptRef.current = '';

    try {
      const url = `wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${activeLang.deepgram}&encoding=linear16&sample_rate=16000&channels=1&interim_results=true`;
      const ws = new WebSocket(url, ['token', process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY!]);
      wsRef.current = ws;

      ws.onopen = async () => {
        setStatusText('LISTENING...');
        await ExpoPlayAudioStream.startMicrophone({
          sampleRate: 16000,
          channels: 1,
          encoding: 'pcm_16bit'
        } as any);

        subRef.current = ExpoPlayAudioStream.subscribeToAudioEvents(async (event) => {
          if (ws.readyState === 1 && event.data) {
            const binary = atob(event.data as string);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            ws.send(bytes.buffer);
          }
        });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const text = data.channel.alternatives[0].transcript;
            if (text && data.is_final) {
              navTranscriptRef.current += (navTranscriptRef.current ? ' ' : '') + text;
            }
          }
        } catch {}
      };
    } catch (err) {
      console.error(err);
      setStatusText('MIC ERROR');
      setIsHolding(false);
    }
  };

  const handlePressOut = async () => {
    if (!isHolding || isProcessing) return;
    setIsHolding(false);
    setIsProcessing(true);
    setStatusText('ANALYZING...');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      if (subRef.current) subRef.current.remove();
      await ExpoPlayAudioStream.stopMicrophone();

      if (wsRef.current) {
        if (wsRef.current.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        wsRef.current.close();
        wsRef.current = null;
      }

      await new Promise((resolve) => setTimeout(resolve, 450));

      const finalTranscript = navTranscriptRef.current.trim() || 'What is in front of me?';

      setStatusText('LOOKING...');
      const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.3 });

      if (photo?.base64) {
        setStatusText('SPEAKING...');
        const response = await navigateWithAI(photo.base64, finalTranscript, activeLang.name);

        setStatusText('SUCCESS');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Speech.speak(response, { rate: 1.0, language: activeLang.tts });
      } else {
        throw new Error('No camera frame captured');
      }
    } catch (err) {
      console.error(err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Speech.speak('Blind mode request failed. Please try again.', { language: activeLang.tts });
      setStatusText('ERROR');
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatusText('HOLD BOTTOM AREA TO ASK'), 1800);
    }
  };

  if (!cameraPermission || !audioPermission) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" mute={true} />

      <View style={styles.topRegion}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <ArrowLeft color={Colors.white} size={28} />
          </Pressable>

          <View style={styles.indicatorBox}>
            <Eye color={Colors.white} size={20} style={{ marginRight: 8 }} />
            <Text style={styles.title}>Blind Mode</Text>
          </View>
        </SafeAreaView>
      </View>

      <Pressable
        style={[styles.pttRegion, isHolding && styles.pttRegionActive, isProcessing && styles.pttRegionProcessing]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isProcessing}
        accessibilityRole="button"
        accessibilityLabel={`Blind Mode. Current Language ${activeLang.name}. Press and hold to ask a question.`}
      >
        <Mic
          color={isHolding ? Colors.error : Colors.white}
          size={64}
          style={{ marginBottom: 24, opacity: isProcessing ? 0.3 : 1 }}
        />
        <Text style={styles.statusText}>{statusText}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topRegion: {
    height: '25%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingTop: 10
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  backBtn: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  indicatorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.modeBlind,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20
  },
  title: {
    color: Colors.white,
    fontSize: Typography.sizes.body,
    fontWeight: '700'
  },
  pttRegion: {
    height: '80%',
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  pttRegionActive: {
    backgroundColor: 'rgba(255,59,48,0.2)'
  },
  pttRegionProcessing: {
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  statusText: {
    color: Colors.white,
    fontSize: Typography.sizes.title3,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center'
  }
});
