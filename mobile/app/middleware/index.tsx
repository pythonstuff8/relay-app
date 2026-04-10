import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography } from '../../constants/theme';
import { GlassPanel } from '../../components/GlassPanel';
import { ArrowLeft, Mic, BellRing, Wifi, WifiOff, Loader } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

// ─── LAN AUTO-DISCOVERY ───
// Scans common local subnets in parallel to find the Relay Mac WebSocket server.
// Each candidate IP gets a fast 2-second WebSocket attempt. First WELCOME wins.

const COMMON_SUBNETS = ['192.168.1', '192.168.0', '10.0.0', '10.0.1', '172.16.0'];
const WS_PORT = 8080;
const SCAN_TIMEOUT_MS = 2500;
const BATCH_SIZE = 30; // parallel connections per batch

async function scanSubnet(
  subnet: string,
  onFound: (ip: string, data: any) => void,
  abortRef: { current: boolean }
): Promise<boolean> {
  for (let batch = 1; batch <= 255; batch += BATCH_SIZE) {
    if (abortRef.current) return false;

    const promises: Promise<boolean>[] = [];
    for (let i = batch; i < Math.min(batch + BATCH_SIZE, 256); i++) {
      if (abortRef.current) return false;
      const ip = `${subnet}.${i}`;
      promises.push(
        new Promise<boolean>((resolve) => {
          if (abortRef.current) { resolve(false); return; }
          try {
            const ws = new WebSocket(`ws://${ip}:${WS_PORT}`);
            const timer = setTimeout(() => { try { ws.close(); } catch(e){} resolve(false); }, SCAN_TIMEOUT_MS);

            ws.onmessage = (e) => {
              try {
                const data = JSON.parse(e.data);
                if (data.type === 'WELCOME') {
                  clearTimeout(timer);
                  abortRef.current = true;
                  onFound(ip, data);
                  // Keep this socket alive — don't close it
                  (globalThis as any).__relayMacSocket = ws;
                  resolve(true);
                  return;
                }
              } catch (err) {}
            };

            ws.onerror = () => { clearTimeout(timer); resolve(false); };
            ws.onclose = () => { clearTimeout(timer); resolve(false); };
          } catch (e) {
            resolve(false);
          }
        })
      );
    }
    const results = await Promise.all(promises);
    if (results.some(Boolean)) return true;
  }
  return false;
}

async function autoDiscover(
  onFound: (ip: string, data: any) => void,
  onProgress: (msg: string) => void,
  abortRef: { current: boolean }
) {
  for (const subnet of COMMON_SUBNETS) {
    if (abortRef.current) return;
    onProgress(`Scanning ${subnet}.* ...`);
    const found = await scanSubnet(subnet, onFound, abortRef);
    if (found) return;
  }
  if (!abortRef.current) {
    onProgress('Could not find Relay Mac. Ensure both devices are on the same Wi-Fi.');
  }
}

// ─── COMPONENT ───
export default function MiddlewareIndex() {
  const router = useRouter();
  const [macIP, setMacIP] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Tap below to find your Mac');
  const abortRef = useRef(false);

  useEffect(() => {
    // Auto-start scan on mount
    startScan();
    return () => { abortRef.current = true; };
  }, []);

  const startScan = () => {
    if (isScanning || isConnected) return;
    abortRef.current = false;
    setIsScanning(true);
    setStatusMsg('Searching for Relay Mac on your network...');
    Speech.speak('Searching for your Mac on the network.', { rate: 1.0 });

    autoDiscover(
      (ip, data) => {
        setIsConnected(true);
        setMacIP(ip);
        setIsScanning(false);
        setStatusMsg(`Connected to ${data.app || 'Relay Mac'} at ${ip}`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Speech.speak(`Connected to Relay Mac at ${ip}. Haptic Mirroring and Remote Microphone are now available.`, { rate: 1.0 });
        console.log(`[Middleware] Auto-discovered Mac at ${ip}`);
      },
      (msg) => {
        setStatusMsg(msg);
        console.log(`[Middleware] ${msg}`);
      },
      abortRef
    ).then(() => {
      setIsScanning(false);
      if (!abortRef.current && !isConnected) {
        Speech.speak('Could not find Relay Mac. Make sure the Mac app is running and both devices are on the same Wi-Fi network.', { rate: 1.0 });
      }
    });
  };

  const handleDisconnect = () => {
    abortRef.current = true;
    const ws = (globalThis as any).__relayMacSocket;
    if (ws) { try { ws.close(); } catch(e){} }
    (globalThis as any).__relayMacSocket = null;
    setIsConnected(false);
    setMacIP('');
    setStatusMsg('Disconnected. Tap to scan again.');
    Speech.speak('Disconnected from Mac.');
  };

  const handleBack = () => {
    Speech.stop();
    abortRef.current = true;
    Haptics.selectionAsync();
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} accessibilityLabel="Go back">
          <ArrowLeft color={Colors.white} size={28} />
        </Pressable>
        <Text style={styles.title}>Connect to Mac</Text>
      </View>

      <View style={[styles.statusBox, isConnected && styles.statusBoxConnected]}>
        {isConnected ? (
          <Wifi color={Colors.success} size={56} />
        ) : (
          <WifiOff color={isScanning ? Colors.modeMiddleware : Colors.error} size={56} />
        )}
        <Text style={[styles.statusText, isConnected && { color: Colors.success }]}>
          {statusMsg}
        </Text>

        {isScanning && (
          <Text style={styles.scanningHint}>This may take a few seconds...</Text>
        )}

        {!isConnected && !isScanning && (
          <Pressable style={styles.scanBtn} onPress={startScan} accessibilityLabel="Scan for Mac again">
            <Text style={styles.scanBtnText}>Scan Again</Text>
          </Pressable>
        )}

        {isConnected && (
          <Pressable style={styles.disconnectBtn} onPress={handleDisconnect} accessibilityLabel="Disconnect from Mac">
            <Text style={styles.disconnectBtnText}>Disconnect</Text>
          </Pressable>
        )}
      </View>

      {isConnected && (
        <>
          <Text style={styles.sectionTitle}>Connected Features</Text>
          <View style={styles.cards}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/middleware/haptics'); }}
              accessibilityLabel="Haptic Mirroring. Receive vibrations when your Mac detects important sounds."
            >
              <GlassPanel style={styles.panel}>
                <View style={styles.iconBox}>
                  <BellRing color={Colors.white} size={24} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>Haptic Mirroring</Text>
                  <Text style={styles.cardDesc}>Receive intense haptic alerts when your Mac detects important sounds.</Text>
                </View>
              </GlassPanel>
            </Pressable>

            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/middleware/remote-mic'); }}
              accessibilityLabel="Remote Microphone. Use your iPhone as a microphone for Mac captioning."
            >
              <GlassPanel style={styles.panel}>
                <View style={styles.iconBox}>
                  <Mic color={Colors.white} size={24} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>Remote Microphone</Text>
                  <Text style={styles.cardDesc}>Use your iPhone as a remote microphone for Mac captioning.</Text>
                </View>
              </GlassPanel>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 40, marginTop: 12,
  },
  backBtn: {
    padding: 8, marginRight: 16, backgroundColor: Colors.glassSecondary, borderRadius: 16,
  },
  title: {
    color: Colors.white, fontSize: Typography.sizes.title1, fontWeight: '700', letterSpacing: -0.5,
  },
  statusBox: {
    alignItems: 'center', padding: 32, backgroundColor: Colors.glassSecondary,
    borderRadius: 24, borderWidth: 1, borderColor: Colors.borderGlassSubtle, marginBottom: 40,
  },
  statusBoxConnected: {
    borderColor: Colors.success,
  },
  statusText: {
    color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '600',
    marginTop: 16, marginBottom: 8, textAlign: 'center',
  },
  scanningHint: {
    color: Colors.textSubtle, fontSize: Typography.sizes.caption, textAlign: 'center', marginTop: 4,
  },
  scanBtn: {
    backgroundColor: Colors.modeMiddleware, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 16, marginTop: 16,
  },
  scanBtnText: {
    color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '600',
  },
  disconnectBtn: {
    backgroundColor: Colors.glassTertiary, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 16, marginTop: 16, borderWidth: 1, borderColor: Colors.error,
  },
  disconnectBtnText: {
    color: Colors.error, fontSize: Typography.sizes.headline, fontWeight: '600',
  },
  sectionTitle: {
    color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '600',
    marginBottom: 16, marginLeft: 4,
  },
  cards: { gap: 16 },
  panel: { flexDirection: 'row', alignItems: 'flex-start', padding: 4 },
  iconBox: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.glassTertiary,
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  cardText: { flex: 1 },
  cardTitle: {
    color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '600', marginBottom: 4,
  },
  cardDesc: {
    color: Colors.textSubtle, fontSize: Typography.sizes.caption, lineHeight: 18,
  },
});
