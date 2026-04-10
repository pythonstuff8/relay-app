import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography } from '../constants/theme';
import { Globe } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useLanguage } from '../context/LanguageContext';
import { getNextLanguage } from '../utils/languages';
import { playOpenAITTS, stopOpenAISpeech } from '../utils/api';

export default function StartupLanguageScreen() {
  const router = useRouter();
  const { langIndex, setLangIndex, activeLang } = useLanguage();

  const speakInstructions = async (lang: typeof activeLang) => {
    Speech.stop();
    await stopOpenAISpeech();
    
    const msg = `Welcome to Relay. ${lang.name} selected. Long press anywhere to cycle languages. Double tap anywhere to start.`;
    
    if (lang.name === 'English') {
      Speech.speak(msg, { rate: 1.0, language: lang.tts });
    } else {
      // Use OpenAI TTS for highly realistic foreign language preview
      try {
        await playOpenAITTS(msg);
      } catch (e) {
        // Fallback to local device TTS if offline/failed
        Speech.speak(msg, { rate: 1.0, language: lang.tts });
      }
    }
  };

  useEffect(() => {
    speakInstructions(activeLang);
    return () => { 
      Speech.stop(); 
      stopOpenAISpeech();
    };
  }, [activeLang]);

  const handleLanguageCycle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const nextIdx = getNextLanguage(langIndex);
    setLangIndex(nextIdx);
  };

  let lastTap = 0;
  const handleTap = async () => {
    const now = Date.now();
    if (now - lastTap < 400) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Speech.stop();
      await stopOpenAISpeech();
      
      const successMsg = `Starting Relay in ${activeLang.name}.`;
      if (activeLang.name === 'English') {
         Speech.speak(successMsg, { rate: 1.0, language: activeLang.tts });
      } else {
         playOpenAITTS(successMsg).catch(() => Speech.speak(successMsg, { rate: 1.0, language: activeLang.tts }));
      }
      router.replace('/home');
    } else {
      lastTap = now;
      speakInstructions(activeLang);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Pressable 
        style={styles.massiveButton}
        onPress={handleTap}
        onLongPress={handleLanguageCycle}
        delayLongPress={600}
        accessibilityRole="button"
        accessibilityLabel={`Relay Setup. Current language: ${activeLang.name}. Double tap to continue. Long press to change language.`}
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
    backgroundColor: Colors.background,
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
    opacity: 0.8,
    marginTop: 12,
  }
});
