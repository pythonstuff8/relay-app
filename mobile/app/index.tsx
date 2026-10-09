import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Globe } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Typography } from '../constants/theme';
import { useLanguage } from '../context/LanguageContext';
import { getNextLanguage, getPreviousLanguage } from '../utils/languages';
import { isScreenReaderOn, sayPrompt, stopSpeaking } from '../utils/speech';

// Launch screen built for blind users: the whole screen is one control.
// Without a screen reader: long press cycles language, double tap continues.
// With VoiceOver/TalkBack: swipe up/down changes language, double tap continues.
export default function StartupLanguageScreen() {
  const router = useRouter();
  const { ready, langIndex, setLangIndex, activeLang, hasConsented } = useLanguage();
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (!ready) return;
    sayPrompt(`Welcome to Relay. ${activeLang.name} selected. Long press anywhere to change language. Double tap anywhere to start.`);
    return () => stopSpeaking();
  }, [ready, activeLang.name]);

  const changeLanguage = (next: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setLangIndex(next);
  };

  const start = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopSpeaking();
    router.replace(hasConsented ? '/home' : '/consent');
  };

  const handleTap = () => {
    if (isScreenReaderOn()) {
      start();
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      lastTapRef.current = 0;
      start();
    } else {
      lastTapRef.current = now;
    }
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case 'increment':
        changeLanguage(getNextLanguage(langIndex));
        break;
      case 'decrement':
        changeLanguage(getPreviousLanguage(langIndex));
        break;
      case 'activate':
        start();
        break;
    }
  };

  if (!ready) return <View style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      <Pressable
        style={styles.massiveButton}
        onPress={handleTap}
        onLongPress={() => changeLanguage(getNextLanguage(langIndex))}
        delayLongPress={600}
        accessibilityRole="adjustable"
        accessibilityLabel="Welcome to Relay. Language"
        accessibilityValue={{ text: activeLang.name }}
        accessibilityHint="Swipe up or down to change language. Double tap to start."
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <Globe color={Colors.white} size={96} style={{ marginBottom: 32 }} />
        <Text style={styles.title}>Welcome to Relay</Text>
        <Text style={styles.langText}>{activeLang.name}</Text>
        <Text style={styles.helperText}>Long-press to change language</Text>
        <Text style={styles.helperText}>Double-tap to start</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.modeBlind,
  },
  massiveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.modeBlind,
  },
  title: {
    color: Colors.white,
    fontSize: Typography.sizes.title1,
    fontWeight: '800',
    marginBottom: 24,
  },
  langText: {
    color: Colors.white,
    fontSize: Typography.sizes.hero,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 48,
  },
  helperText: {
    color: Colors.white,
    fontSize: Typography.sizes.body,
    fontWeight: '600',
    opacity: 0.85,
    marginTop: 12,
  },
});
