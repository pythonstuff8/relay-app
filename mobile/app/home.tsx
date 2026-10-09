import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Glasses, MonitorSmartphone, Settings } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Typography } from '../constants/theme';
import { useBridge } from '../context/BridgeContext';
import { sayPrompt, stopSpeaking } from '../utils/speech';

export default function HomeScreen() {
  const router = useRouter();
  const { status, desktopName } = useBridge();
  const connected = status === 'connected';

  useEffect(() => {
    sayPrompt('Relay menu. Top half: Standalone mode. Bottom half: Connect to computer. Settings button in the top right corner.');
    return () => stopSpeaking();
  }, []);

  const go = (path: '/standalone' | '/middleware' | '/settings') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    stopSpeaking();
    router.push(path);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Text style={styles.brand} accessibilityRole="header">Relay</Text>
        <Pressable
          onPress={() => go('/settings')}
          style={styles.settingsBtn}
          accessibilityRole="button"
          accessibilityLabel="Settings, privacy, and help"
          hitSlop={8}
        >
          <Settings color={Colors.white} size={26} />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.massiveCard, pressed && styles.pressed]}
        onPress={() => go('/standalone')}
        accessibilityRole="button"
        accessibilityLabel="Standalone mode. Blind mode, read aloud, captions, Braille, quick phrases, and loud sound alerts."
      >
        <View style={[styles.iconBox, { backgroundColor: Colors.modeBlind }]}>
          <Glasses color={Colors.white} size={48} />
        </View>
        <Text style={styles.cardTitle}>STANDALONE MODE</Text>
        <Text style={styles.cardDesc}>Your eyes and ears on the go.</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable
        style={({ pressed }) => [styles.massiveCard, pressed && styles.pressed]}
        onPress={() => go('/middleware')}
        accessibilityRole="button"
        accessibilityLabel={
          connected
            ? `Connect to computer. Connected to ${desktopName || 'your computer'}.`
            : 'Connect to computer. Pair with the Relay desktop app for alerts, captions, and Remote Mic.'
        }
      >
        <View style={[styles.iconBox, { backgroundColor: Colors.modeMiddleware }]}>
          <MonitorSmartphone color={Colors.onAccent} size={48} />
        </View>
        <Text style={styles.cardTitle}>CONNECT TO COMPUTER</Text>
        <Text style={styles.cardDesc}>
          {connected ? `Connected to ${desktopName || 'your computer'}` : 'Alerts, captions, and Remote Mic.'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  brand: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '800' },
  settingsBtn: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  massiveCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Colors.glassSecondary,
  },
  pressed: { backgroundColor: Colors.glassPrimary },
  divider: { height: 4, backgroundColor: Colors.borderGlassSubtle },
  iconBox: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  cardTitle: {
    color: Colors.white,
    fontSize: Typography.sizes.title2,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 12,
  },
  cardDesc: {
    color: Colors.textSubtle,
    fontSize: Typography.sizes.title3,
    textAlign: 'center',
    lineHeight: 30,
    fontWeight: '500',
  },
});
