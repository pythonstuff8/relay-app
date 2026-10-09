import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { MessageSquareText, Plus, Volume2, X } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Colors, Typography } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { readJsonArray, StorageKeys, writeJson } from '../../utils/storage';
import { sayPrompt, speakAloud, stopSpeaking } from '../../utils/speech';

const DEFAULT_PHRASES = [
  'I am Deaf. Please write it down or type on my phone.',
  'I am hard of hearing. Please face me and speak clearly.',
  'I am blind. Could you help me find the way?',
  'Please call 911. This is an emergency.',
  'Thank you for your help!',
  'Can you repeat that more slowly, please?',
];

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function QuickPhrasesScreen() {
  const { activeLang } = useLanguage();
  const insets = useSafeAreaInsets();
  const [phrases, setPhrases] = useState<string[]>(DEFAULT_PHRASES);
  const [shown, setShown] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    readJsonArray<string>(StorageKeys.phrases).then((stored) => {
      if (stored) setPhrases(stored.filter((item) => typeof item === 'string'));
    });
    sayPrompt('Quick phrases. Tap a phrase to show it in large text. Each phrase also has a speak button.');
    return () => stopSpeaking();
  }, []);

  const save = (next: string[]) => {
    setPhrases(next);
    writeJson(StorageKeys.phrases, next);
  };

  const addPhrase = () => {
    const text = draft.trim();
    if (!text) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    save([text, ...phrases.filter((item) => item !== text)]);
    setDraft('');
  };

  const removePhrase = (text: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    save(phrases.filter((item) => item !== text));
    sayPrompt('Phrase removed');
  };

  const speak = (text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    speakAloud(text, activeLang.tts);
  };

  const onPhraseAction = (text: string) => (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'speak') speak(text);
    if (event.nativeEvent.actionName === 'delete') removePhrase(text);
    if (event.nativeEvent.actionName === 'activate') setShown(text);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Quick Phrases" icon={MessageSquareText} color={Colors.modePhrases} textColor={Colors.onAccent} />

        <ScrollView contentContainerStyle={styles.list}>
          {phrases.map((text) => (
            <View key={text} style={styles.card}>
              <Pressable
                style={styles.cardMain}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShown(text);
                }}
                onLongPress={() => removePhrase(text)}
                delayLongPress={700}
                accessibilityRole="button"
                accessibilityLabel={text}
                accessibilityHint="Double tap to show in large text. Use actions to speak or delete."
                accessibilityActions={[{ name: 'activate' }, { name: 'speak', label: 'Speak out loud' }, { name: 'delete', label: 'Delete phrase' }]}
                onAccessibilityAction={onPhraseAction(text)}
              >
                <Text style={styles.cardText}>{text}</Text>
              </Pressable>
              <Pressable
                style={styles.speakBtn}
                onPress={() => speak(text)}
                accessibilityRole="button"
                accessibilityLabel={`Speak: ${text}`}
              >
                <Volume2 color={Colors.onAccent} size={24} />
              </Pressable>
            </View>
          ))}
          <Text style={styles.hint}>Long press a phrase to delete it.</Text>
        </ScrollView>

        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Add your own phrase..."
            placeholderTextColor={Colors.textSubtle}
            onSubmitEditing={addPhrase}
            returnKeyType="done"
            maxLength={200}
            accessibilityLabel="New phrase"
          />
          <Pressable style={styles.addBtn} onPress={addPhrase} accessibilityRole="button" accessibilityLabel="Add phrase">
            <Plus color={Colors.onAccent} size={26} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={shown !== null} animationType="fade" onRequestClose={() => setShown(null)} supportedOrientations={['portrait', 'landscape']}>
        {shown !== null ? <KeepAwake /> : null}
        {/* SafeAreaView reports no insets inside a Modal, so apply them directly. */}
        <View style={[styles.fullScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Pressable
            style={styles.closeBtn}
            onPress={() => setShown(null)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <X color={Colors.onAccent} size={32} />
          </Pressable>
          <ScrollView contentContainerStyle={styles.fullScreenBody}>
            <Text style={styles.fullScreenText} accessibilityRole="header">{shown}</Text>
          </ScrollView>
          <Pressable
            style={styles.fullScreenSpeak}
            onPress={() => shown && speak(shown)}
            accessibilityRole="button"
            accessibilityLabel="Speak out loud"
          >
            <Volume2 color={Colors.white} size={28} />
            <Text style={styles.fullScreenSpeakText}>SPEAK</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  list: { gap: 12, paddingBottom: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 20,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
    overflow: 'hidden',
  },
  cardMain: { flex: 1, padding: 18, justifyContent: 'center' },
  cardText: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '600', lineHeight: 30 },
  speakBtn: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.modePhrases,
  },
  hint: { color: Colors.textSubtle, textAlign: 'center', fontSize: Typography.sizes.caption, marginTop: 4 },
  addRow: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  input: {
    flex: 1,
    height: 56,
    borderRadius: 24,
    paddingHorizontal: 20,
    color: Colors.white,
    fontSize: Typography.sizes.body,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  addBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.modePhrases,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreen: { flex: 1, backgroundColor: Colors.white },
  closeBtn: { alignSelf: 'flex-end', padding: 20 },
  fullScreenBody: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  fullScreenText: { color: Colors.black, fontSize: 52, fontWeight: '800', lineHeight: 64, textAlign: 'center' },
  fullScreenSpeak: {
    margin: 20,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.black,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenSpeakText: { color: Colors.white, fontSize: Typography.sizes.title2, fontWeight: '900', letterSpacing: 2 },
});
