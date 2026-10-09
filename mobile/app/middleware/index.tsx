import React, { useEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BellRing, Captions, Mic, MonitorSmartphone, QrCode, Wifi, WifiOff } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MenuStrip } from '../../components/MenuStrip';
import { Colors, Typography } from '../../constants/theme';
import { Links } from '../../constants/links';
import { useBridge } from '../../context/BridgeContext';
import { sayPrompt, stopSpeaking } from '../../utils/speech';

export default function ConnectToComputer() {
  const router = useRouter();
  const { status, pairing, desktopName, error, reconnect } = useBridge();
  const connected = status === 'connected';
  const name = desktopName || pairing?.name || 'your computer';

  useEffect(() => {
    if (connected) {
      sayPrompt(`Connected to ${name}. Options: Sound alerts, Caption mirror, and Remote mic.`);
    } else if (!pairing) {
      sayPrompt('Connect to computer. Open Relay on your computer, go to Settings, then Phone, and scan the code with the button below.');
    }
    return () => stopSpeaking();
    // Announce once per connection state change.
  }, [connected, pairing, name]);

  const open = (path: '/middleware/pair' | '/middleware/haptics' | '/middleware/captions' | '/middleware/remote-mic') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    stopSpeaking();
    router.push(path);
  };

  const statusText = connected
    ? `Connected to ${name}`
    : status === 'connecting'
      ? `Connecting to ${name}...`
      : pairing
        ? `Not connected to ${name}`
        : 'No computer paired yet';

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Computer" icon={MonitorSmartphone} color={Colors.modeMiddleware} textColor={Colors.onAccent} />

      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <View style={[styles.statusBox, connected && styles.statusBoxConnected]} accessible accessibilityLiveRegion="polite">
          {connected ? <Wifi color={Colors.success} size={48} /> : <WifiOff color={pairing ? Colors.warning : Colors.textSubtle} size={48} />}
          <Text style={[styles.statusText, connected && { color: Colors.success }]}>{statusText}</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {pairing && !connected && status !== 'connecting' ? (
            <Pressable style={styles.retryBtn} onPress={reconnect} accessibilityRole="button" accessibilityLabel="Try connecting again">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>

        {connected ? (
          <>
            <MenuStrip
              title="SOUND ALERTS"
              description="Vibrate when your computer hears an alarm, knock, or name"
              icon={BellRing}
              color={Colors.error}
              onPress={() => open('/middleware/haptics')}
              accessibilityLabel="Sound alerts. Vibrate when your computer detects important sounds."
            />
            <MenuStrip
              title="CAPTION MIRROR"
              description="Read your computer's live captions here"
              icon={Captions}
              color={Colors.modeDeaf}
              onPress={() => open('/middleware/captions')}
              accessibilityLabel="Caption mirror. Read the computer's live captions on your phone."
            />
            <MenuStrip
              title="REMOTE MIC"
              description="Put your phone near the speaker for better captions"
              icon={Mic}
              color={Colors.success}
              onPress={() => open('/middleware/remote-mic')}
              accessibilityLabel="Remote mic. Use your phone as the microphone for computer captions."
            />
          </>
        ) : null}

        <MenuStrip
          title={pairing ? 'PAIR AGAIN' : 'SCAN PAIRING CODE'}
          description="On your computer: Relay Settings, then Phone"
          icon={QrCode}
          color={Colors.modeMiddleware}
          onPress={() => open('/middleware/pair')}
          accessibilityLabel={pairing ? 'Pair again with a new code' : 'Scan the pairing code shown on your computer'}
        />

        {!pairing ? (
          <Pressable onPress={() => Linking.openURL(Links.desktopDownload)} accessibilityRole="link" accessibilityLabel="Get Relay for your computer">
            <Text style={styles.link}>Need Relay for your computer? Get it free</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  statusBox: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.glassSecondary,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  statusBoxConnected: { borderColor: Colors.success },
  statusText: {
    color: Colors.white,
    fontSize: Typography.sizes.title3,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  errorText: { color: Colors.textSubtle, fontSize: Typography.sizes.body, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Colors.modeMiddleware,
  },
  retryText: { color: Colors.onAccent, fontSize: Typography.sizes.headline, fontWeight: '700' },
  link: { color: Colors.modeRead, fontSize: Typography.sizes.body, textAlign: 'center', paddingVertical: 12, fontWeight: '600' },
});
