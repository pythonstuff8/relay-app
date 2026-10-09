import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { QrCode } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Colors, Typography } from '../../constants/theme';
import { useBridge } from '../../context/BridgeContext';
import { parseManualPairing, parsePairingUrl, type Pairing } from '../../utils/pairing';
import { sayPrompt, stopSpeaking } from '../../utils/speech';

export default function PairScreen() {
  const router = useRouter();
  const { pair } = useBridge();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const handledRef = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    sayPrompt('Point your camera at the pairing code on your computer. You can also enter the code by hand with the button at the bottom.');
    return () => stopSpeaking();
  }, []);

  const finish = (pairing: Pairing) => {
    handledRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    pair(pairing);
    sayPrompt(`Pairing with ${pairing.name}.`);
    router.back();
  };

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (handledRef.current) return;
    const pairing = parsePairingUrl(data);
    if (pairing) {
      finish(pairing);
    } else if (message !== 'not-relay') {
      setMessage('not-relay');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const submitManual = () => {
    const pairing = parseManualPairing(address, code);
    if (!pairing) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMessage('Check the address (like 192.168.1.20:8080) and the 10-character code.');
      return;
    }
    finish(pairing);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Pair Computer" icon={QrCode} color={Colors.modeMiddleware} textColor={Colors.onAccent} />

        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.steps}>
            On your computer, open Relay, then Settings, then Phone. Keep both devices on the same Wi-Fi.
          </Text>

          {!manual ? (
            permission?.granted ? (
              <View style={styles.scanner} accessible accessibilityLabel="Camera viewfinder for the pairing code">
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={onScanned}
                />
                <View style={styles.frame} pointerEvents="none" />
              </View>
            ) : permission && permission.status !== 'undetermined' ? (
              <PermissionNotice
                title="Camera access needed"
                message="The camera is used to scan the pairing code. You can also enter the code by hand."
                onRetry={permission.canAskAgain ? requestPermission : undefined}
              />
            ) : null
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>Address</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="192.168.1.20:8080"
                placeholderTextColor={Colors.textSubtle}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Computer address, shown under the QR code"
              />
              <Text style={styles.label}>Pairing code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="ABCDE-12345"
                placeholderTextColor={Colors.textSubtle}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={11}
                accessibilityLabel="Pairing code, 10 characters"
              />
              <Pressable style={styles.primaryBtn} onPress={submitManual} accessibilityRole="button" accessibilityLabel="Pair">
                <Text style={styles.primaryText}>Pair</Text>
              </Pressable>
            </View>
          )}

          {message ? (
            <Text style={styles.message} accessibilityLiveRegion="polite">
              {message === 'not-relay' ? 'That code is not a Relay pairing code. Scan the code in Relay Settings, Phone.' : message}
            </Text>
          ) : null}

          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              setMessage('');
              setManual((value) => !value);
            }}
            accessibilityRole="button"
            accessibilityLabel={manual ? 'Scan the QR code instead' : 'Enter the code by hand'}
          >
            <Text style={styles.secondaryText}>{manual ? 'Scan QR code instead' : 'Enter code by hand'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  steps: { color: Colors.text, fontSize: Typography.sizes.body, lineHeight: 24 },
  scanner: {
    height: 340,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 220,
    height: 220,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: Colors.modeMiddleware,
  },
  form: { gap: 8 },
  label: { color: Colors.textSubtle, fontSize: Typography.sizes.body, fontWeight: '600', marginTop: 8 },
  input: {
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 18,
    color: Colors.white,
    fontSize: Typography.sizes.title3,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  primaryBtn: {
    marginTop: 16,
    height: 60,
    borderRadius: 18,
    backgroundColor: Colors.modeMiddleware,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: Colors.onAccent, fontSize: Typography.sizes.title3, fontWeight: '800' },
  message: { color: Colors.warning, fontSize: Typography.sizes.body, textAlign: 'center' },
  secondaryBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.glassPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '700' },
});
