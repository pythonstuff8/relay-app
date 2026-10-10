import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { FingerprintPattern, Mic, MicOff, MonitorSmartphone } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Colors, Typography } from '../../constants/theme';
import { useBridge } from '../../context/BridgeContext';
import { useLanguage } from '../../context/LanguageContext';
import { compressForTouch } from '../../utils/ai';
import { ensureMicPermission } from '../../utils/audio';
import { playWordHaptic, toBrailleText, WORD_GAP_MS } from '../../utils/braille';
import { startLiveCaptions, type LiveCaptionSession } from '../../utils/deepgram';
import { describeError } from '../../utils/relayApi';
import { sayPrompt, stopSpeaking } from '../../utils/speech';

// Feel the Conversation: each caption is shortened to a few words and played as
// Braille vibration, so a DeafBlind user can follow speech by touch. Words are
// also shown huge for anyone with some vision.

const MAX_QUEUE = 3;
const MAX_WORDS = 5;
const SPEEDS = [0.75, 1, 1.5, 2];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fallbackCompress(text: string) {
  return toBrailleText(text).split(' ').filter(Boolean).slice(-MAX_WORDS).join(' ');
}

export default function FeelConversationScreen() {
  useKeepAwake();
  const { activeLang } = useLanguage();
  const bridge = useBridge();
  const computerReady = bridge.status === 'connected';

  const [source, setSource] = useState<'phone' | 'computer'>(computerReady ? 'computer' : 'phone');
  const [active, setActive] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [status, setStatus] = useState('Tap Start. Speech near you becomes Braille vibration.');
  const [phrase, setPhrase] = useState('');
  const [word, setWord] = useState('');
  const [speedIndex, setSpeedIndex] = useState(1);

  const sessionRef = useRef<LiveCaptionSession | null>(null);
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const activeRef = useRef(false);
  const speedRef = useRef(SPEEDS[1]);
  const lastCaptionIdRef = useRef(bridge.captions.at(-1)?.id ?? 0);

  useEffect(() => { speedRef.current = SPEEDS[speedIndex]; }, [speedIndex]);

  useEffect(() => {
    sayPrompt('Feel the conversation. What people say near you is shortened to a few words and played as Braille vibrations. Tap the large button to start.');
    return () => stopSpeaking();
  }, []);

  const playQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    while (activeRef.current && queueRef.current.length) {
      const next = queueRef.current.shift()!;
      setPhrase(next);
      // A strong double tap marks the start of each new phrase.
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await sleep(500);
      for (const w of next.split(' ')) {
        if (!activeRef.current) break;
        setWord(w);
        await playWordHaptic(w, speedRef.current, () => !activeRef.current);
        await sleep(WORD_GAP_MS / speedRef.current);
      }
      setWord('');
      await sleep(600);
    }
    playingRef.current = false;
  }, []);

  const enqueue = useCallback(async (caption: string) => {
    let short = '';
    try {
      short = toBrailleText(await compressForTouch(caption));
    } catch {
      short = '';
    }
    if (!short) short = fallbackCompress(caption);
    short = short.split(' ').slice(0, MAX_WORDS).join(' ');
    if (!short || !activeRef.current) return;
    // Keep up with live speech: drop the oldest phrases if we fall behind.
    queueRef.current = [...queueRef.current, short].slice(-MAX_QUEUE);
    playQueue();
  }, [playQueue]);

  // Computer source: use the paired desktop's captions.
  const latestCaption = bridge.captions.at(-1);
  useEffect(() => {
    if (!active || source !== 'computer' || !latestCaption) return;
    if (latestCaption.id <= lastCaptionIdRef.current) return;
    lastCaptionIdRef.current = latestCaption.id;
    enqueue(latestCaption.text);
  }, [active, source, latestCaption, enqueue]);

  const stop = useCallback(async () => {
    activeRef.current = false;
    setActive(false);
    queueRef.current = [];
    setWord('');
    const session = sessionRef.current;
    sessionRef.current = null;
    await session?.stop();
  }, []);

  useFocusEffect(useCallback(() => () => { stop(); }, [stop]));

  const start = async () => {
    activeRef.current = true;
    setActive(true);
    setPhrase('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (source === 'computer') {
      lastCaptionIdRef.current = bridge.captions.at(-1)?.id ?? 0;
      setStatus(`Feeling captions from ${bridge.desktopName || 'your computer'}`);
      return;
    }
    if (!(await ensureMicPermission())) {
      setMicDenied(true);
      activeRef.current = false;
      setActive(false);
      return;
    }
    setMicDenied(false);
    setStatus('Connecting...');
    try {
      sessionRef.current = await startLiveCaptions(activeLang.deepgram, {
        onOpen: () => setStatus('Listening. Phrases play as vibration.'),
        onTranscript: (text, isFinal) => {
          if (isFinal && text.trim()) enqueue(text);
        },
        onError: (message) => setStatus(message),
        onClose: () => {
          sessionRef.current = null;
          activeRef.current = false;
          setActive(false);
          setStatus('Stopped');
        },
      });
    } catch (error) {
      activeRef.current = false;
      setActive(false);
      setStatus(describeError(error));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const toggle = () => (active ? stop() : start());

  const switchSource = async () => {
    if (!computerReady) return;
    await stop();
    setSource((current) => (current === 'phone' ? 'computer' : 'phone'));
    Haptics.selectionAsync();
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    Haptics.selectionAsync();
    sayPrompt(`Speed ${SPEEDS[next]}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Feel"
        icon={FingerprintPattern}
        color={Colors.warning}
        textColor={Colors.onAccent}
        right={
          <>
            {computerReady ? (
              <Pressable
                style={styles.badge}
                onPress={switchSource}
                accessibilityRole="button"
                accessibilityLabel={`Source: ${source === 'computer' ? 'computer captions' : 'phone microphone'}. Tap to switch.`}
              >
                {source === 'computer' ? <MonitorSmartphone color={Colors.white} size={18} /> : <Mic color={Colors.white} size={18} />}
              </Pressable>
            ) : null}
            <Pressable style={styles.badge} onPress={cycleSpeed} accessibilityRole="button" accessibilityLabel={`Vibration speed ${SPEEDS[speedIndex]}. Tap to change.`}>
              <Text style={styles.badgeText}>{`${SPEEDS[speedIndex]}x`}</Text>
            </Pressable>
          </>
        }
      />

      {micDenied ? (
        <PermissionNotice title="Microphone access needed" message="Feel the Conversation listens with the microphone." onRetry={start} />
      ) : null}

      <View style={styles.display} accessible accessibilityLabel={phrase ? `Last phrase: ${phrase}` : 'No phrase yet'}>
        <Text style={styles.word} adjustsFontSizeToFit numberOfLines={1}>{word || ' '}</Text>
        <Text style={styles.phrase}>{phrase || 'Phrases appear here'}</Text>
      </View>

      <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
      <Text style={styles.hint}>A double buzz starts each phrase. Strong taps are raised dots, light taps are flat dots.</Text>

      <Pressable
        style={[styles.mainBtn, active && styles.mainBtnOn]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={active ? 'Stop feeling the conversation' : 'Start feeling the conversation'}
      >
        {active ? <MicOff color={Colors.white} size={40} /> : <FingerprintPattern color={Colors.onAccent} size={40} />}
        <Text style={[styles.mainText, active && { color: Colors.white }]}>{active ? 'STOP' : 'START'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  badge: {
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  badgeText: { color: Colors.white, fontSize: Typography.sizes.caption, fontWeight: '800' },
  display: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: Colors.glassTertiary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  word: { color: Colors.warning, fontSize: 88, fontWeight: '900', letterSpacing: 2 },
  phrase: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '600', marginTop: 16, textAlign: 'center' },
  status: { color: Colors.white, fontSize: Typography.sizes.body, fontWeight: '700', textAlign: 'center', marginTop: 14 },
  hint: { color: Colors.textSubtle, fontSize: Typography.sizes.caption, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  mainBtn: {
    height: 120,
    borderRadius: 28,
    backgroundColor: Colors.warning,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginVertical: 14,
  },
  mainBtnOn: { backgroundColor: Colors.error },
  mainText: { color: Colors.onAccent, fontSize: Typography.sizes.title1, fontWeight: '900', letterSpacing: 3 },
});
