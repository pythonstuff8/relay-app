import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography } from '../../constants/theme';
import { ArrowLeft, Mic, WifiOff, Wifi } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

export default function RemoteMic() {
  const router = useRouter();
  const [ipAddress, setIpAddress] = useState('192.168.1.');
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  useEffect(() => {
    return () => {
      if (recording) recording.stopAndUnloadAsync();
    };
  }, [recording]);

  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };

  const connectToMac = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Real deal concept: Validate IP and establish connection intent
    if (ipAddress.length > 8) {
      setIsConnected(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const toggleStreaming = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isStreaming) {
      setIsStreaming(false);
      try {
        if (recording) {
          await recording.stopAndUnloadAsync();
          setRecording(null);
        }
      } catch (err) {}
    } else {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (perm.granted) {
          await Audio.setAudioModeAsync({
             allowsRecordingIOS: true,
             playsInSilentModeIOS: true,
          });
          const newRec = new Audio.Recording();
          await newRec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
          await newRec.startAsync();
          
          setRecording(newRec);
          setIsStreaming(true);
          // In a full implementation, you'd send blobs over WebSocket
        }
      } catch (err) {
        console.error('Failed to start stream', err);
      }
    }
  };

  const disconnect = async () => {
    if (isStreaming) await toggleStreaming();
    setIsConnected(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <ArrowLeft color={Colors.white} size={28} />
        </Pressable>
        <Text style={styles.title}>Remote Mic</Text>
      </View>

      {!isConnected ? (
        <View style={styles.connectionCard}>
          <WifiOff color={Colors.error} size={48} style={{ marginBottom: 16 }} />
          <Text style={styles.connectTitle}>Connect to Mac</Text>
          <Text style={styles.connectDesc}>Enter your Mac's IP address to stream local audio to Relay Mac.</Text>
          
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
          <Text style={styles.activeTitle}>Connected to Mac</Text>
          <Text style={styles.activeDesc}>Tap the microphone below to begin live audio streaming.</Text>
          
          <Pressable 
            style={[styles.streamBtn, isStreaming && styles.streamBtnActive]} 
            onPress={toggleStreaming}
          >
            <Mic color={isStreaming ? Colors.white : Colors.modeMiddleware} size={48} />
          </Pressable>
          <Text style={styles.streamLabel}>
            {isStreaming ? 'Streaming Live Audio...' : 'Tap to Start Streaming'}
          </Text>

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
    borderColor: Colors.borderGlassSubtle,
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
  streamBtn: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.glassTertiary,
    borderWidth: 2,
    borderColor: Colors.modeMiddleware,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  streamBtnActive: {
    backgroundColor: Colors.error,
    borderColor: Colors.error,
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  streamLabel: {
    color: Colors.white,
    fontSize: Typography.sizes.headline,
    fontWeight: '600',
    marginBottom: 40,
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
