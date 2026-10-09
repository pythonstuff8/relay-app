import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { AArrowDown, AArrowUp, Captions, Trash2 } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Colors, Typography } from '../../constants/theme';
import { useBridge } from '../../context/BridgeContext';
import { useLanguage } from '../../context/LanguageContext';
import { sayPrompt, stopSpeaking } from '../../utils/speech';

const SPEAKER_COLORS = [Colors.modeRead, Colors.modeLoud, Colors.modePhrases, Colors.success, Colors.modeBlind];
const MIN_SCALE = 0.8;
const MAX_SCALE = 2.2;

export default function CaptionMirrorScreen() {
  useKeepAwake();
  const { captions, interimCaption, status, desktopName, clearCaptions } = useBridge();
  const { prefs, updatePrefs } = useLanguage();
  const scrollRef = useRef<ScrollView>(null);
  const scale = prefs.captionScale;
  const fontSize = Math.round(Typography.sizes.title3 * scale);

  useEffect(() => {
    sayPrompt('Caption mirror. Captions from your computer appear here. Use the buttons at the top to change text size.');
    return () => stopSpeaking();
  }, []);

  const changeScale = (delta: number) => {
    Haptics.selectionAsync();
    updatePrefs({ captionScale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round((scale + delta) * 10) / 10)) });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Captions"
        icon={Captions}
        color={Colors.modeDeaf}
        right={
          <>
            <Pressable style={styles.iconBtn} onPress={() => changeScale(-0.2)} accessibilityRole="button" accessibilityLabel="Smaller text">
              <AArrowDown color={Colors.white} size={22} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => changeScale(0.2)} accessibilityRole="button" accessibilityLabel="Larger text">
              <AArrowUp color={Colors.white} size={22} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={clearCaptions} accessibilityRole="button" accessibilityLabel="Clear captions">
              <Trash2 color={Colors.white} size={20} />
            </Pressable>
          </>
        }
      />

      {status !== 'connected' ? (
        <Text style={styles.banner}>Computer not connected. Captions will resume when it reconnects.</Text>
      ) : null}

      <View style={styles.box}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 18, gap: 14 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {captions.length === 0 && !interimCaption ? (
            <Text style={styles.empty}>
              {`Start captions on ${desktopName || 'your computer'} and they will appear here.`}
            </Text>
          ) : null}
          {captions.map((caption) => (
            <View key={caption.id}>
              {caption.speaker !== null ? (
                <Text style={[styles.speaker, { color: SPEAKER_COLORS[caption.speaker % SPEAKER_COLORS.length] }]}>
                  {`Speaker ${caption.speaker + 1}`}
                </Text>
              ) : null}
              <Text style={[styles.caption, { fontSize, lineHeight: Math.round(fontSize * 1.35) }]}>{caption.text}</Text>
            </View>
          ))}
          {interimCaption ? (
            <Text style={[styles.caption, styles.interim, { fontSize, lineHeight: Math.round(fontSize * 1.35) }]}>{interimCaption}</Text>
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  iconBtn: {
    padding: 10,
    borderRadius: 16,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  banner: { color: Colors.warning, fontSize: Typography.sizes.body, marginBottom: 10 },
  box: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: Colors.glassTertiary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
    marginBottom: 8,
    overflow: 'hidden',
  },
  empty: { color: Colors.textSubtle, fontSize: Typography.sizes.body, textAlign: 'center', marginTop: 32 },
  speaker: { fontSize: Typography.sizes.caption, fontWeight: '800', letterSpacing: 1, marginBottom: 2, textTransform: 'uppercase' },
  caption: { color: Colors.white, fontWeight: '600' },
  interim: { opacity: 0.6 },
});
