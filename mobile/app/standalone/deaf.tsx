import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography } from '../../constants/theme';
import { ArrowLeft, Ear, Volume2, Mic } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { ExpoPlayAudioStream, Subscription } from '@saltmango/expo-audio-stream';
import { useLanguage } from '../../context/LanguageContext';
import { transcribeWithOpenAI } from '../../utils/api';

export default function DeafMode() {
  const router = useRouter();
  const { activeLang } = useLanguage();

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [ttsText, setTtsText] = useState('');
  const [interimText, setInterimText] = useState('');

  const wsRef = React.useRef<WebSocket | null>(null);
  const subRef = React.useRef<Subscription | null>(null);

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

  const stopStreaming = async () => {
    try {
      if (subRef.current) subRef.current.remove();
      await ExpoPlayAudioStream.stopMicrophone();
      if (wsRef.current) {
        if (wsRef.current.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        }
        wsRef.current.close();
      }
    } catch (err) {}
    wsRef.current = null;
    subRef.current = null;
  };

  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };

  const toggleRecording = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    if (isRecording) {
      setIsRecording(false);
      setInterimText('');
      await stopStreaming();
    } else {
      setIsRecording(true);
      setInterimText('Connecting to Live Stream...');
      
      try {
        const url = `wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${activeLang.deepgram}&encoding=linear16&sample_rate=16000&channels=1&interim_results=true`;
        const ws = new WebSocket(url, ['token', process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY!]);
        wsRef.current = ws;

        ws.onopen = async () => {
          setInterimText('Listening live...');
          await ExpoPlayAudioStream.startMicrophone({
            sampleRate: 16000,
            channels: 1,
            encoding: 'pcm_16bit'
          } as any);

          subRef.current = ExpoPlayAudioStream.subscribeToAudioEvents(async (event) => {
            if (ws.readyState === 1 && event.data) {
              const binary = atob(event.data as string);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              ws.send(bytes.buffer);
            }
          });
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
              const text = data.channel.alternatives[0].transcript;
              if (text) {
                if (data.is_final) {
                  setTranscript(prev => [...prev, text]);
                  setInterimText('');
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } else {
                  setInterimText(text);
                }
              }
            }
          } catch(e) {}
        };

        ws.onclose = () => {
          setIsRecording(false);
          setInterimText('');
        };
        
        ws.onerror = (e) => {
          console.error('[WebSocket Error]', e);
        };

      } catch (err) {
        console.error('Failed to start live stream', err);
        setIsRecording(false);
        setInterimText('❌ Connection failed');
        setTimeout(() => setInterimText(''), 3000);
      }
    }
  };

  const handleSpeak = () => {
    if (!ttsText.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak(ttsText, { rate: 0.9, pitch: 1, language: activeLang.tts });
    // Keep record of what we said
    setTranscript(prev => [...prev, `You: ${ttsText}`]);
    setTtsText('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <ArrowLeft color={Colors.white} size={28} />
        </Pressable>
        
        <View style={styles.indicatorBox}>
           <Ear color={Colors.white} size={20} style={{ marginRight: 8 }} />
           <Text style={styles.title}>Deaf Mode</Text>
        </View>
      </View>


      <View style={styles.transcriptContainer}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {transcript.length === 0 && !interimText ? (
            <Text style={styles.placeholder}>Conversation will appear here...</Text>
          ) : (
            <>
              {transcript.map((text, i) => (
                <View key={i} style={[
                  styles.messageBubble, 
                  text.startsWith('You:') ? styles.messageYou : styles.messageOther
                ]}>
                  <Text style={styles.messageText}>{text}</Text>
                </View>
              ))}
              {interimText ? (
                <View style={[styles.messageBubble, styles.messageOther, { opacity: 0.7 }]}>
                  <Text style={styles.messageText}>{interimText}</Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>

      <View style={styles.controls}>
        <Pressable 
          style={[styles.micBtn, isRecording && styles.micBtnActive]} 
          onPress={toggleRecording}
        >
          <Mic color={isRecording ? Colors.white : Colors.modeDeaf} size={32} />
          {isRecording && <View style={styles.recordingDot} />}
        </Pressable>

        <View style={styles.ttsContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type to speak..."
            placeholderTextColor={Colors.textSubtle}
            value={ttsText}
            onChangeText={setTtsText}
            onSubmitEditing={handleSpeak}
            returnKeyType="send"
          />
          <Pressable style={styles.speakBtn} onPress={handleSpeak}>
            <Volume2 color={Colors.white} size={24} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    marginTop: 8,
  },
  backBtn: {
    padding: 12,
    backgroundColor: Colors.glassSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.glassTertiary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  langBtnText: {
    color: Colors.white,
    fontSize: Typography.sizes.caption,
    fontWeight: '600',
  },
  indicatorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.modeDeaf,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: Colors.modeDeaf,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  title: {
    color: Colors.white,
    fontSize: Typography.sizes.body,
    fontWeight: '700',
  },
  transcriptContainer: {
    flex: 1,
    backgroundColor: Colors.glassTertiary,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
    marginBottom: 20,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 20,
    gap: 12,
  },
  placeholder: {
    color: Colors.textSubtle,
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
  },
  messageBubble: {
    padding: 16,
    borderRadius: 20,
    maxWidth: '85%',
  },
  messageYou: {
    backgroundColor: Colors.modeDeaf,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  messageOther: {
    backgroundColor: Colors.glassSecondary,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  messageText: {
    color: Colors.white,
    fontSize: Typography.sizes.body,
    lineHeight: 24,
  },
  controls: {
    gap: 16,
  },
  micBtn: {
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  micBtnActive: {
    backgroundColor: Colors.error,
    borderColor: Colors.error,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.white,
    marginLeft: 12,
  },
  ttsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 24,
    paddingHorizontal: 20,
    color: Colors.white,
    fontSize: Typography.sizes.body,
    height: 56,
  },
  speakBtn: {
    width: 56,
    height: 56,
    backgroundColor: Colors.modeDeaf,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.modeDeaf,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  }
});
