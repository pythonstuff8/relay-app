import React, { useEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Typography } from '../constants/theme';
import { Links } from '../constants/links';
import { CONSENT_VERSION, useLanguage } from '../context/LanguageContext';
import { sayPrompt, stopSpeaking } from '../utils/speech';

const POINTS = [
  {
    title: 'What Relay does',
    body: 'Relay describes your surroundings, reads text aloud, shows live captions, and alerts you to sounds. It can also pair with the Relay desktop app.',
  },
  {
    title: 'What is shared, and when',
    body: 'When you ask for help, Relay sends the camera photo and your question to OpenAI, and streams microphone audio to Deepgram for captions. This only happens while you use those features. Relay has no accounts, no ads, and no tracking, and does not store your photos or audio.',
  },
  {
    title: 'Use it as an aid, not a guarantee',
    body: 'AI answers and captions can be wrong. Relay does not replace a cane, guide dog, or mobility training. Always check for traffic, stairs, and other hazards yourself.',
  },
];

export default function ConsentScreen() {
  const router = useRouter();
  const { updatePrefs } = useLanguage();

  useEffect(() => {
    sayPrompt(
      'Before you start. Relay sends camera photos to OpenAI and microphone audio to Deepgram only when you use a feature that needs it. ' +
        'Relay is an aid and does not replace a cane or guide dog. The Agree and continue button is at the bottom of the screen.'
    );
    return () => stopSpeaking();
  }, []);

  const accept = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updatePrefs({ consentVersion: CONSENT_VERSION });
    router.replace('/home');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ShieldCheck color={Colors.success} size={56} />
          <Text style={styles.title} accessibilityRole="header">Before you start</Text>
        </View>

        {POINTS.map((point) => (
          <View key={point.title} style={styles.card} accessible>
            <Text style={styles.cardTitle}>{point.title}</Text>
            <Text style={styles.cardBody}>{point.body}</Text>
          </View>
        ))}

        <View style={styles.links}>
          <Pressable onPress={() => Linking.openURL(Links.privacy)} accessibilityRole="link" accessibilityLabel="Read the privacy policy">
            <Text style={styles.link}>Privacy Policy</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(Links.terms)} accessibilityRole="link" accessibilityLabel="Read the terms of use">
            <Text style={styles.link}>Terms of Use</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Pressable
        style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.85 }]}
        onPress={accept}
        accessibilityRole="button"
        accessibilityLabel="Agree and continue"
        accessibilityHint="Confirms you understand how Relay shares data and that it is an assistive aid"
      >
        <Text style={styles.acceptText}>Agree and continue</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 32 },
  hero: { alignItems: 'center', marginTop: 12, marginBottom: 20 },
  title: {
    color: Colors.white,
    fontSize: Typography.sizes.title1,
    fontWeight: '800',
    marginTop: 12,
  },
  card: {
    backgroundColor: Colors.glassSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
    padding: 20,
    marginBottom: 14,
  },
  cardTitle: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '700', marginBottom: 8 },
  cardBody: { color: Colors.text, fontSize: Typography.sizes.body, lineHeight: 25 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: 8 },
  link: { color: Colors.modeRead, fontSize: Typography.sizes.body, fontWeight: '600', paddingVertical: 8 },
  acceptBtn: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 20,
    borderRadius: 20,
    backgroundColor: Colors.success,
    alignItems: 'center',
  },
  acceptText: { color: Colors.onAccent, fontSize: Typography.sizes.title3, fontWeight: '800' },
});
