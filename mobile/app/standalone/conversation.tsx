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
import { Mic, MicOff, Users, Volume2 } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Colors, Typography } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { translateCaption } from '../../utils/ai';
import { ensureMicPermission } from '../../utils/audio';
import { startLiveCaptions, type LiveCaptionSession } from '../../utils/deepgram';
import { SUPPORTED_LANGUAGES } from '../../utils/languages';
import { describeError } from '../../utils/relayApi';
import { sayPrompt, speakAloud, stopSpeaking } from '../../utils/speech';

// Shown on the partner's side before the user types anything.
const GREETINGS: Record<string, string> = {
  English: 'Hi! I will type here. Please speak normally.',
  Spanish: '¡Hola! Escribiré aquí. Por favor, hable con normalidad.',
  French: 'Bonjour ! J’écrirai ici. Parlez normalement, s’il vous plaît.',
  Hindi: 'नमस्ते! मैं यहाँ टाइप करूँगा। कृपया सामान्य रूप से बोलें।',
  Mandarin: '你好！我会在这里打字。请正常说话。',
  Arabic: 'مرحبًا! سأكتب هنا. من فضلك تحدث بشكل طبيعي.',
};

// Face-to-face mode: the phone lies flat between two people. The top half is
// flipped toward the other person and shows what the user typed (translated if
// needed); the bottom half shows live captions of the other person.
export default function ConversationScreen() {
  useKeepAwake();
  const { activeLang, langIndex } = useLanguage();
  const [partnerIndex, setPartnerIndex] = useState(langIndex);
  const partner = SUPPORTED_LANGUAGES[partnerIndex];
  const translating = partner.name !== activeLang.name;

  const [listening, setListening] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [theirLines, setTheirLines] = useState<string[]>([]);
  const [interim, setInterim] = useState('');
  const [myMessage, setMyMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const sessionRef = useRef<LiveCaptionSession | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    sayPrompt('Conversation mode. Lay the phone flat between you and the other person. The top half faces them.');
    return () => stopSpeaking();
  }, []);

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setListening(false);
    setInterim('');
    await session?.stop();
  }, []);

  useFocusEffect(useCallback(() => () => { stop(); }, [stop]));

  const start = async () => {
    if (!(await ensureMicPermission())) {
      setMicDenied(true);
      return;
    }
    setMicDenied(false);
    setListening(true);
    setStatus('Connecting...');
    try {
      sessionRef.current = await startLiveCaptions(partner.deepgram, {
        onOpen: () => setStatus(`Listening for ${partner.name}`),
        onTranscript: (text, isFinal) => {
          if (!isFinal) {
            setInterim(text);
            return;
          }
          setInterim('');
          Haptics.selectionAsync();
          if (!translating) {
            setTheirLines((lines) => [...lines, text].slice(-30));
            return;
          }
          translateCaption(text, activeLang.openai)
            .then((translated) => setTheirLines((lines) => [...lines, translated].slice(-30)))
            .catch(() => setTheirLines((lines) => [...lines, text].slice(-30)));
        },
        onError: (message) => setStatus(message),
        onClose: () => {
          sessionRef.current = null;
          setListening(false);
          setStatus('Paused');
        },
      });
    } catch (error) {
      setListening(false);
      setStatus(describeError(error));
    }
  };

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (listening) stop();
    else start();
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    let shown = text;
    if (translating) {
      try {
        shown = await translateCaption(text, partner.openai);
      } catch {
        shown = text;
      }
    }
    setMyMessage(shown);
    speakAloud(shown, partner.tts);
  };

  const cyclePartner = async () => {
    Haptics.selectionAsync();
    await stop();
    setPartnerIndex((index) => (index + 1) % SUPPORTED_LANGUAGES.length);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title="Conversation"
          icon={Users}
          color={Colors.modeRead}
          textColor={Colors.onAccent}
          right={
            <Pressable
              onPress={cyclePartner}
              style={styles.langBtn}
              accessibilityRole="button"
              accessibilityLabel={`Other person speaks ${partner.name}. Tap to change.`}
            >
              <Text style={styles.langText}>{`They speak: ${partner.name}`}</Text>
            </Pressable>
          }
        />

        {/* Facing the other person: rotated so they can read it across the table. */}
        <View style={[styles.half, styles.partnerHalf]} accessibilityLabel={`Shown to the other person: ${myMessage || 'nothing yet'}`}>
          <View style={styles.flipped}>
            <Text style={styles.partnerHint}>{translating ? `Message (${partner.name})` : 'Message'}</Text>
            <Text style={styles.partnerText} numberOfLines={6} adjustsFontSizeToFit>
              {myMessage || GREETINGS[partner.name] || GREETINGS.English}
            </Text>
          </View>
        </View>

        {micDenied ? (
          <PermissionNotice title="Microphone access needed" message="Conversation mode needs the microphone." onRetry={start} />
        ) : null}

        <View style={[styles.half, styles.myHalf]}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {theirLines.length === 0 && !interim ? (
              <Text style={styles.placeholder}>{`Tap Listen. What they say appears here${translating ? ` in ${activeLang.name}` : ''}.`}</Text>
            ) : null}
            {theirLines.map((line, index) => (
              <Text key={index} style={styles.theirText}>{line}</Text>
            ))}
            {interim ? <Text style={[styles.theirText, { opacity: 0.55 }]}>{interim}</Text> : null}
          </ScrollView>
        </View>

        {status ? <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text> : null}

        <View style={styles.controls}>
          <Pressable
            style={[styles.listenBtn, listening && styles.listenBtnOn]}
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={listening ? 'Stop listening' : 'Listen to the other person'}
          >
            {listening ? <MicOff color={Colors.white} size={26} /> : <Mic color={Colors.onAccent} size={26} />}
          </Pressable>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder="Type your reply..."
            placeholderTextColor={Colors.textSubtle}
            returnKeyType="send"
            accessibilityLabel="Your reply"
          />
          <Pressable style={styles.sendBtn} onPress={send} accessibilityRole="button" accessibilityLabel="Show and speak reply">
            <Volume2 color={Colors.white} size={24} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  langText: { color: Colors.white, fontSize: Typography.sizes.caption, fontWeight: '700' },
  half: { flex: 1, borderRadius: 24, overflow: 'hidden' },
  partnerHalf: { backgroundColor: Colors.white, marginBottom: 12, justifyContent: 'center' },
  flipped: { transform: [{ rotate: '180deg' }], padding: 20 },
  partnerHint: { color: '#555', fontSize: Typography.sizes.caption, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  partnerText: { color: Colors.black, fontSize: 34, fontWeight: '800', lineHeight: 42 },
  myHalf: { backgroundColor: Colors.glassTertiary, borderWidth: 1, borderColor: Colors.borderGlassSubtle },
  placeholder: { color: Colors.textSubtle, fontSize: Typography.sizes.body, textAlign: 'center', marginTop: 24 },
  theirText: { color: Colors.white, fontSize: Typography.sizes.title3, lineHeight: 30, fontWeight: '600' },
  status: { color: Colors.textSubtle, textAlign: 'center', marginTop: 8 },
  controls: { flexDirection: 'row', gap: 10, marginVertical: 10 },
  listenBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.modeRead,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listenBtnOn: { backgroundColor: Colors.error },
  input: {
    flex: 1,
    height: 56,
    borderRadius: 24,
    paddingHorizontal: 18,
    color: Colors.white,
    fontSize: Typography.sizes.body,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  sendBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.modeDeaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
