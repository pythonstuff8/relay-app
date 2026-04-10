import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography } from '../../constants/theme';
import { ArrowLeft, Ear, Eye, Hand } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

export default function StandaloneIndex() {
  const router = useRouter();

  useEffect(() => {
    Speech.stop();
    Speech.speak(
      'Standalone mode. Top area, Blind Mode. Middle area, Deaf Support. Lower area, Braille Keyboard.',
      { rate: 1.0 }
    );
    return () => { Speech.stop(); };
  }, []);

  const handleBack = () => {
    Speech.stop();
    Haptics.selectionAsync();
    router.back();
  };

  const handleFeature = (feature: 'blind' | 'deaf' | 'braille') => {
    Speech.stop();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push(`/standalone/${feature}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable 
            onPress={handleBack} 
            style={styles.backBtn}
            accessibilityLabel="Go Back. Top left corner."
            accessibilityRole="button"
        >
          <ArrowLeft color={Colors.white} size={36} />
        </Pressable>
      </View>

      <Pressable 
        style={({ pressed }) => [styles.massiveStrip, { backgroundColor: Colors.glassTertiary }, pressed && styles.pressed]}
        onPress={() => handleFeature('blind')}
        accessibilityRole="button"
        accessibilityLabel="Blind Mode. Top of screen."
      >
        <Eye color={Colors.modeBlind} size={48} style={styles.icon} />
        <Text style={styles.cardTitle}>BLIND MODE</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable 
        style={({ pressed }) => [styles.massiveStrip, { backgroundColor: Colors.glassTertiary }, pressed && styles.pressed]}
        onPress={() => handleFeature('deaf')}
        accessibilityRole="button"
        accessibilityLabel="Deaf Support. Second area."
      >
        <Ear color={Colors.modeDeaf} size={42} style={styles.icon} />
        <Text style={styles.cardTitle}>DEAF SUPPORT</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable 
        style={({ pressed }) => [styles.massiveStrip, { backgroundColor: Colors.glassTertiary }, pressed && styles.pressed]}
        onPress={() => handleFeature('braille')}
        accessibilityRole="button"
        accessibilityLabel="Braille Keyboard. Lower area."
      >
        <Hand color={Colors.warning} size={42} style={styles.icon} />
        <Text style={styles.cardTitle}>BRAILLE KEYBOARD</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    position: 'absolute',
    top: 50,
    left: 0,
    zIndex: 10,
  },
  backBtn: {
    padding: 16,
    backgroundColor: Colors.glassSecondary,
    borderRadius: 24,
  },
  massiveStrip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: Colors.glassSecondary,
  },
  divider: {
    height: 4,
    backgroundColor: Colors.borderGlassSubtle,
  },
  icon: {
    marginRight: 24,
  },
  cardTitle: {
    color: Colors.white,
    fontSize: Typography.sizes.title2,
    fontWeight: '800',
    letterSpacing: 2,
  }
});
