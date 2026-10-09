import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { Ear, Languages, Mic, MicOff, Volume2 } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Colors, Typography } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { translateCaption } from '../../utils/ai';
import { ensureMicPermission } from '../../utils/audio';
import { startLiveCaptions, type LiveCaptionSession } from '../../utils/deepgram';
import { describeError } from '../../utils/relayApi';
import { SUPPORTED_LANGUAGES } from '../../utils/languages';
import { speakAloud } from '../../utils/speech';

type Line = { id: number; text: string; translation?: string; mine?: boolean };

export default function DeafMode() {
  useKeepAwake();
  const { activeLang, prefs, updatePrefs } = useLanguage();
  const [micDenied, setMicDenied] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [interimText, setInterimText] = useState('');
  const [statusText, setStatusText] = useState('');
  const [ttsText, setTtsText] = useState('');
  const [showTranslate, setShowTranslate] = useState(false);
  const sessionRef = useRef<LiveCaptionSession | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const idRef = useRef(0);
  const translateToRef = useRef<number | null>(prefs.translateTo);

  useEffect(() => {
    translateToRef.current = prefs.translateTo;
  }, [prefs.translateTo]);

  const translateTarget = prefs.translateTo !== null ? SUPPORTED_LANGUAGES[prefs.translateTo] : null;

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setIsRecording(false);
    setInterimText('');
    await session?.stop();
  }, []);

  useFocusEffect(useCallback(() => () => { stop(); }, [stop]));
  useEffect(() => () => { stop(); }, [stop]);

  const addFinal = (text: string) => {
    const id = ++idRef.current;
    setLines((current) => [...current, { id, text }]);
    setInterimText('');
    Haptics.selectionAsync();
    const target = translateToRef.current;
    if (target === null) return;
    translateCaption(text, SUPPORTED_LANGUAGES[target].openai)
      .then((translation) => {
        setLines((current) => current.map((line) => (line.id === id ? { ...line, translation } : line)));
      })
      .catch(() => {});
  };

  const start = async () => {
    const granted = await ensureMicPermission();
    if (!granted) {
      setMicDenied(true);
      return;
    }
    setMicDenied(false);
    setIsRecording(true);
    setStatusText('Connecting...');
    try {
      sessionRef.current = await startLiveCaptions(activeLang.deepgram, {
        onOpen: () => setStatusText(`Listening (${activeLang.name})`),
        onTranscript: (text, isFinal) => (isFinal ? addFinal(text) : setInterimText(text)),
        onError: (message) => setStatusText(message),
        onClose: () => {
          sessionRef.current = null;
          setIsRecording(false);
          setInterimText('');
          setStatusText('Captions stopped. Tap the microphone to start again.');
        },
      });
    } catch (error) {
      setIsRecording(false);
      setStatusText(describeError(error));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const toggleRecording = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isRecording) {
      await stop();
      setStatusText('Captions paused.');
    } else {
      await start();
    }
  };

  const handleSpeak = () => {
    const text = ttsText.trim();
    if (!text) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speakAloud(text, activeLang.tts);
    setLines((current) => [...current, { id: ++idRef.current, text, mine: true }]);
    setTtsText('');
  };

  const chooseTranslation = (index: number | null) => {
    Haptics.selectionAsync();
    updatePrefs({ translateTo: index });
    setShowTranslate(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title="Live Captions"
          icon={Ear}
          color={Colors.modeDeaf}
          right={
            <Pressable
              onPress={() => setShowTranslate((value) => !value)}
              style={[styles.translateBtn, translateTarget && styles.translateBtnOn]}
              accessibilityRole="button"
              accessibilityLabel={translateTarget ? `Translation on, into ${translateTarget.name}` : 'Translation off'}
              accessibilityHint="Choose a language to translate captions into"
              accessibilityState={{ expanded: showTranslate }}
            >
              <Languages color={translateTarget ? Colors.onAccent : Colors.white} size={20} />
            </Pressable>
          }
        />

        {showTranslate ? (
          <View style={styles.translatePanel}>
            <Text style={styles.panelTitle}>{`Speaker language: ${activeLang.name}. Translate captions into:`}</Text>
            <View style={styles.chips}>
              <Pressable
                style={[styles.chip, prefs.translateTo === null && styles.chipOn]}
                onPress={() => chooseTranslation(null)}
                accessibilityRole="radio"
                accessibilityState={{ selected: prefs.translateTo === null }}
                accessibilityLabel="No translation"
              >
                <Text style={[styles.chipText, prefs.translateTo === null && styles.chipTextOn]}>Off</Text>
              </Pressable>
              {SUPPORTED_LANGUAGES.map((lang, index) =>
                lang.name === activeLang.name ? null : (
                  <Pressable
                    key={lang.name}
                    style={[styles.chip, prefs.translateTo === index && styles.chipOn]}
                    onPress={() => chooseTranslation(index)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: prefs.translateTo === index }}
                    accessibilityLabel={lang.name}
                  >
                    <Text style={[styles.chipText, prefs.translateTo === index && styles.chipTextOn]}>{lang.name}</Text>
                  </Pressable>
                )
              )}
            </View>
          </View>
        ) : null}

        {micDenied ? (
          <PermissionNotice
            title="Microphone access needed"
            message="Live captions need the microphone. Allow microphone access in Settings."
            onRetry={start}
          />
        ) : null}

        <View style={styles.transcriptContainer}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {lines.length === 0 && !interimText ? (
              <Text style={styles.placeholder}>Tap the microphone to start live captions.</Text>
            ) : (
              lines.map((line) => (
                <View key={line.id} style={[styles.bubble, line.mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <Text style={styles.bubbleText}>{line.text}</Text>
                  {line.translation ? <Text style={styles.translation}>{line.translation}</Text> : null}
                </View>
              ))
            )}
            {interimText ? (
              <View style={[styles.bubble, styles.bubbleOther, { opacity: 0.7 }]}>
                <Text style={styles.bubbleText}>{interimText}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>

        {statusText ? (
          <Text style={styles.status} accessibilityLiveRegion="polite">{statusText}</Text>
        ) : null}

        <View style={styles.controls}>
          <Pressable
            style={[styles.micBtn, isRecording && styles.micBtnActive]}
            onPress={toggleRecording}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop live captions' : 'Start live captions'}
            accessibilityState={{ selected: isRecording }}
          >
            {isRecording ? <MicOff color={Colors.white} size={32} /> : <Mic color={Colors.white} size={32} />}
            <Text style={styles.micText}>{isRecording ? 'STOP CAPTIONS' : 'START CAPTIONS'}</Text>
          </Pressable>

          <View style={styles.ttsRow}>
            <TextInput
              style={styles.input}
              placeholder="Type to speak..."
              placeholderTextColor={Colors.textSubtle}
              value={ttsText}
              onChangeText={setTtsText}
              onSubmitEditing={handleSpeak}
              returnKeyType="send"
              accessibilityLabel="Type a message to speak out loud"
            />
            <Pressable
              style={styles.speakBtn}
              onPress={handleSpeak}
              accessibilityRole="button"
              accessibilityLabel="Speak typed message out loud"
            >
              <Volume2 color={Colors.white} size={24} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  translateBtn: {
    padding: 10,
    borderRadius: 18,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  translateBtnOn: { backgroundColor: Colors.modeLoud, borderColor: Colors.modeLoud },
  translatePanel: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.glassSecondary,
    marginBottom: 12,
  },
  panelTitle: { color: Colors.text, fontSize: Typography.sizes.body, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  chipOn: { backgroundColor: Colors.white, borderColor: Colors.white },
  chipText: { color: Colors.white, fontSize: Typography.sizes.body, fontWeight: '600' },
  chipTextOn: { color: Colors.onAccent },
  transcriptContainer: {
    flex: 1,
    backgroundColor: Colors.glassTertiary,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
    overflow: 'hidden',
  },
  scrollContent: { padding: 16, gap: 12 },
  placeholder: { color: Colors.textSubtle, textAlign: 'center', marginTop: 40, fontSize: Typography.sizes.body },
  bubble: { padding: 16, borderRadius: 20, maxWidth: '90%' },
  bubbleMine: { backgroundColor: Colors.modeDeaf, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: Colors.glassSecondary,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  bubbleText: { color: Colors.white, fontSize: Typography.sizes.title3, lineHeight: 30 },
  translation: { color: Colors.modeLoud, fontSize: Typography.sizes.headline, lineHeight: 24, marginTop: 6 },
  status: { color: Colors.textSubtle, fontSize: Typography.sizes.body, textAlign: 'center', marginTop: 10 },
  controls: { gap: 12, marginTop: 12, marginBottom: 8 },
  micBtn: {
    backgroundColor: Colors.modeDeaf,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  micBtnActive: { backgroundColor: Colors.error },
  micText: { color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '800', letterSpacing: 1 },
  ttsRow: { flexDirection: 'row', gap: 12 },
  input: {
    flex: 1,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 24,
    paddingHorizontal: 20,
    color: Colors.white,
    fontSize: Typography.sizes.body,
    height: 56,
  },
  speakBtn: {
    width: 56,
    height: 56,
    backgroundColor: Colors.modeDeaf,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
