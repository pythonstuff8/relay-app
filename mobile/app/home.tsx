import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography } from '../constants/theme';
import { Glasses, MonitorSmartphone } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useLanguage } from '../context/LanguageContext';

export default function HomeScreen() {
  const router = useRouter();
  const { activeLang } = useLanguage();

  useEffect(() => {
    // Stop any previous speech and announce immediately
    Speech.stop();
    Speech.speak(`Relay Menu. Top of screen for Standalone Mode with Blind Mode, Deaf Support, and Braille Keyboard. Bottom of screen for Connect to Mac.`, { rate: 1.0, language: activeLang.tts });
    return () => { Speech.stop(); };
  }, [activeLang]);

  const handleSelectMode = (mode: 'standalone' | 'middleware') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Speech.stop();
    router.push(`/${mode}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Pressable 
        style={({ pressed }) => [styles.massiveCard, { backgroundColor: Colors.glassSecondary }, pressed && styles.pressed]}
        onPress={() => handleSelectMode('standalone')}
        accessibilityRole="button"
        accessibilityLabel="Standalone Mode. Tap top half of screen to enter."
      >
        <View style={[styles.iconBox, { backgroundColor: Colors.modeBlind }]}>
          <Glasses color={Colors.white} size={48} />
        </View>
        <Text style={styles.cardTitle}>STANDALONE MODE</Text>
        <Text style={styles.cardDesc}>Act as your eyes and ears on the go.</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable 
        style={({ pressed }) => [styles.massiveCard, { backgroundColor: Colors.glassSecondary }, pressed && styles.pressed]}
        onPress={() => handleSelectMode('middleware')}
        accessibilityRole="button"
        accessibilityLabel="Connect to Mac. Tap bottom half of screen to enter."
      >
        <View style={[styles.iconBox, { backgroundColor: Colors.modeMiddleware }]}>
          <MonitorSmartphone color={Colors.white} size={48} />
        </View>
        <Text style={styles.cardTitle}>CONNECT TO MAC</Text>
        <Text style={styles.cardDesc}>Intense haptics when your Mac detects sounds.</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  massiveCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pressed: {
    opacity: 0.8,
    backgroundColor: Colors.glassTertiary,
  },
  divider: {
    height: 4,
    backgroundColor: Colors.borderGlassSubtle,
  },
  iconBox: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  cardTitle: {
    color: Colors.white,
    fontSize: Typography.sizes.title1,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 12,
  },
  cardDesc: {
    color: Colors.textSubtle,
    fontSize: Typography.sizes.title3,
    textAlign: 'center',
    lineHeight: 32,
    fontWeight: '500',
  }
});
