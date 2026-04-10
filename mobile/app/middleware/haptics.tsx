import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography } from '../../constants/theme';
import { ArrowLeft, BellRing, WifiOff, Wifi } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function HapticMirroring() {
  const router = useRouter();
  const [ipAddress, setIpAddress] = useState('192.168.1.');
  const [isConnected, setIsConnected] = useState(false);
  const [lastAlert, setLastAlert] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };

  const connectToMac = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (ws.current) {
      ws.current.close();
    }

    try {
      const socket = new WebSocket(`ws://${ipAddress}:8080`);
      
      socket.onopen = () => {
        setIsConnected(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      };

      socket.onmessage = (e) => {
        // Real-deal pattern: Mac sends a JSON ping when sound is detected
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'ALERT') {
            setLastAlert(data.message || 'Alert Detected');
            // Trigger intense haptic pattern for emergency
            if (data.severity === 'high') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), 200);
              setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), 400);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
          }
        } catch {
           Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
           setLastAlert(e.data);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
      };
      
      socket.onerror = (err) => {
        setIsConnected(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      };

      ws.current = socket;
    } catch (e) {
      setIsConnected(false);
    }
  };

  const disconnect = () => {
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    setIsConnected(false);
    setLastAlert(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <ArrowLeft color={Colors.white} size={28} />
        </Pressable>
        <Text style={styles.title}>Haptic Mirroring</Text>
      </View>

      {!isConnected ? (
        <View style={styles.connectionCard}>
          <WifiOff color={Colors.error} size={48} style={{ marginBottom: 16 }} />
          <Text style={styles.connectTitle}>Connect to Mac</Text>
          <Text style={styles.connectDesc}>Enter your Mac's IP address to receive haptic alerts.</Text>
          
          <TextInput
            style={styles.input}
            value={ipAddress}
            onChangeText={setIpAddress}
            placeholder="192.168.1.X"
            placeholderTextColor={Colors.textSubtle}
            keyboardType="numbers-and-punctuation"
          />
          <Pressable style={styles.connectBtn} onPress={connectToMac}>
            <Text style={styles.btnText}>Connect</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.activeCard}>
          <Wifi color={Colors.success} size={48} style={{ marginBottom: 16 }} />
          <Text style={styles.activeTitle}>Connected & Listening</Text>
          <Text style={styles.activeDesc}>Your phone will vibrate intensely when the Mac detects important sounds.</Text>
          
          {lastAlert && (
            <View style={styles.alertBox}>
              <BellRing color={Colors.warning} size={32} />
              <Text style={styles.alertText}>{lastAlert}</Text>
            </View>
          )}

          <Pressable style={styles.disconnectBtn} onPress={disconnect}>
            <Text style={styles.btnText}>Disconnect</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 12,
  },
  backBtn: {
    padding: 8,
    marginRight: 16,
    backgroundColor: Colors.glassSecondary,
    borderRadius: 16,
  },
  title: {
    color: Colors.white,
    fontSize: Typography.sizes.title1,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  connectionCard: {
    backgroundColor: Colors.glassSecondary,
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  connectTitle: {
    color: Colors.white,
    fontSize: Typography.sizes.title3,
    fontWeight: '600',
    marginBottom: 8,
  },
  connectDesc: {
    color: Colors.textSubtle,
    fontSize: Typography.sizes.body,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: Colors.glassTertiary,
    width: '100%',
    padding: 16,
    borderRadius: 12,
    color: Colors.white,
    fontSize: Typography.sizes.body,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    marginBottom: 24,
  },
  connectBtn: {
    backgroundColor: Colors.modeMiddleware,
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: {
    color: Colors.white,
    fontSize: Typography.sizes.headline,
    fontWeight: '600',
  },
  activeCard: {
    backgroundColor: Colors.glassSecondary,
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.success,
  },
  activeTitle: {
    color: Colors.success,
    fontSize: Typography.sizes.title3,
    fontWeight: '600',
    marginBottom: 8,
  },
  activeDesc: {
    color: Colors.textSubtle,
    fontSize: Typography.sizes.body,
    textAlign: 'center',
    marginBottom: 32,
  },
  alertBox: {
    backgroundColor: 'rgba(255, 159, 10, 0.15)',
    padding: 24,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  alertText: {
    color: Colors.warning,
    fontSize: Typography.sizes.title3,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  disconnectBtn: {
    backgroundColor: Colors.glassTertiary,
    borderWidth: 1,
    borderColor: Colors.error,
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  }
});
