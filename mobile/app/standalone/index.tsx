import React, { useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpenText, Ear, Eye, Glasses, Hand, MessageSquareText, Volume2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MenuStrip } from '../../components/MenuStrip';
import { Colors } from '../../constants/theme';
import { sayPrompt, stopSpeaking } from '../../utils/speech';

const FEATURES = [
  {
    path: '/standalone/blind',
    title: 'BLIND MODE',
    description: 'Hold to ask what is around you',
    icon: Eye,
    color: Colors.modeBlind,
  },
  {
    path: '/standalone/read-aloud',
    title: 'READ ALOUD',
    description: 'Read signs, menus, and documents',
    icon: BookOpenText,
    color: Colors.modeRead,
  },
  {
    path: '/standalone/deaf',
    title: 'LIVE CAPTIONS',
    description: 'Captions, translation, type to speak',
    icon: Ear,
    color: Colors.modeDeaf,
  },
  {
    path: '/standalone/braille',
    title: 'BRAILLE',
    description: 'Braille keyboard and haptic reader',
    icon: Hand,
    color: Colors.warning,
  },
  {
    path: '/standalone/phrases',
    title: 'QUICK PHRASES',
    description: 'Show or speak ready-made messages',
    icon: MessageSquareText,
    color: Colors.modePhrases,
  },
  {
    path: '/standalone/loud-sound',
    title: 'LOUD SOUND ALERT',
    description: 'Flash and vibrate on loud sounds',
    icon: Volume2,
    color: Colors.modeLoud,
  },
] as const;

export default function StandaloneIndex() {
  const router = useRouter();

  useEffect(() => {
    sayPrompt(
      'Standalone mode. From top to bottom: Blind mode, Read aloud, Live captions, Braille, Quick phrases, and Loud sound alert.'
    );
    return () => stopSpeaking();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="Standalone" icon={Glasses} color={Colors.modeBlind} />
      <ScrollView contentContainerStyle={styles.list}>
        {FEATURES.map((feature, index) => (
          <MenuStrip
            key={feature.path}
            title={feature.title}
            description={feature.description}
            icon={feature.icon}
            color={feature.color}
            accessibilityLabel={`${feature.title.toLowerCase()}. ${feature.description}. Option ${index + 1} of ${FEATURES.length}.`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              stopSpeaking();
              router.push(feature.path);
            }}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  list: { flexGrow: 1, gap: 12, paddingBottom: 16 },
});
