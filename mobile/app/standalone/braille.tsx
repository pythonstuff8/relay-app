import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, PanResponder, type AccessibilityActionEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Hand, Volume2, Vibrate } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Colors, Typography } from '../../constants/theme';
import { sayPrompt, speakAloud, stopSpeaking } from '../../utils/speech';
import { BRAILLE, BRAILLE_INPUT, playCharacterHaptic, playWordHaptic } from '../../utils/braille';

type FeedbackMode = 'haptic' | 'voice' | 'both';

// ─── COMPONENT ───
const SWIPE_THRESHOLD = 50;
const PRACTICE_TEXT = 'welcome to relay';

export default function BrailleMode() {
  // Braille Input State
  const [dots, setDots] = useState([false, false, false, false, false, false]);
  const [typedText, setTypedText] = useState('');

  // Haptic Reader State
  const [readerMode, setReaderMode] = useState(false);
  const [readerText, setReaderText] = useState(PRACTICE_TEXT);
  const [charIndex, setCharIndex] = useState(0);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('both');
  const [speed, setSpeed] = useState(1.0);
  const playingRef = useRef(false);

  // The swipe handler is created once, so it reads live values through refs.
  const readerTextRef = useRef(readerText);
  const charIndexRef = useRef(charIndex);
  const feedbackModeRef = useRef(feedbackMode);
  const speedRef = useRef(speed);
  useEffect(() => { readerTextRef.current = readerText; }, [readerText]);
  useEffect(() => { charIndexRef.current = charIndex; }, [charIndex]);
  useEffect(() => { feedbackModeRef.current = feedbackMode; }, [feedbackMode]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    sayPrompt('Braille. Input mode is on. Six dots are in two columns: dots 1 to 3 on the left, 4 to 6 on the right. Press Enter to add the letter.');
    return () => stopSpeaking();
  }, []);

  // ─── Braille Input ───
  const toggleDot = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDots(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const submitCharacter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const key = dots.map(d => (d ? '1' : '0')).join('');
    const char = BRAILLE_INPUT[key];
    if (!char) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (feedbackMode !== 'haptic') sayPrompt('Unknown pattern');
      return;
    }
    setTypedText(prev => prev + char);
    if (feedbackMode !== 'haptic') sayPrompt(char === ' ' ? 'Space' : char);
    setDots([false, false, false, false, false, false]);
  };

  const deleteChar = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setTypedText(prev => prev.slice(0, -1));
    if (feedbackMode !== 'haptic') sayPrompt('Deleted');
  };

  const speakAll = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speakAloud(typedText || 'Nothing typed yet', 'en-US');
  };

  // ─── Haptic Reader ───
  const emitCharacter = useCallback(async (idx: number) => {
    const text = readerTextRef.current;
    if (idx < 0 || idx >= text.length) return;
    const char = text[idx];
    const mode = feedbackModeRef.current;
    if (mode === 'voice' || mode === 'both') {
      sayPrompt(char === ' ' ? 'Space' : char);
    }
    if (mode === 'haptic' || mode === 'both') {
      await playCharacterHaptic(char, speedRef.current);
    }
  }, []);

  const moveTo = useCallback((idx: number) => {
    const text = readerTextRef.current;
    if (!text) return;
    const next = Math.max(0, Math.min(idx, text.length - 1));
    charIndexRef.current = next;
    setCharIndex(next);
    emitCharacter(next);
  }, [emitCharacter]);

  const handleLongPressWord = useCallback(async () => {
    if (playingRef.current) return;
    const text = readerTextRef.current;
    if (!text) return;
    playingRef.current = true;

    // Find current word boundaries
    let start = charIndexRef.current;
    let end = charIndexRef.current;
    while (start > 0 && text[start - 1] !== ' ') start--;
    while (end < text.length && text[end] !== ' ') end++;
    const word = text.slice(start, end);

    const mode = feedbackModeRef.current;
    if (mode === 'voice' || mode === 'both') sayPrompt(word);
    if (mode === 'haptic' || mode === 'both') await playWordHaptic(word, speedRef.current);
    playingRef.current = false;
  }, []);

  // ─── Gesture Handler ───
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) < SWIPE_THRESHOLD && Math.abs(gesture.dy) < SWIPE_THRESHOLD) {
          moveTo(charIndexRef.current); // Tap: repeat current
        } else if (gesture.dx > SWIPE_THRESHOLD) {
          moveTo(charIndexRef.current + 1); // Swipe right: next
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          moveTo(charIndexRef.current - 1); // Swipe left: previous
        }
      },
    })
  ).current;

  const handleReaderAccessibilityAction = (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case 'increment':
        moveTo(charIndexRef.current + 1);
        break;
      case 'decrement':
        moveTo(charIndexRef.current - 1);
        break;
      case 'activate':
        moveTo(charIndexRef.current);
        break;
      case 'longpress':
        handleLongPressWord();
        break;
    }
  };

  const cycleFeedbackMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next: FeedbackMode = feedbackMode === 'both' ? 'haptic' : feedbackMode === 'haptic' ? 'voice' : 'both';
    setFeedbackMode(next);
    sayPrompt(`Mode: ${next === 'both' ? 'Voice and haptic' : next === 'haptic' ? 'Haptic only' : 'Voice only'}`);
  };

  const cycleSpeed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = speed >= 2.0 ? 0.5 : speed + 0.5;
    setSpeed(next);
    sayPrompt(`Speed ${next}x`);
  };

  const enterInputMode = () => {
    setReaderMode(false);
    sayPrompt('Input mode');
  };

  const enterReaderMode = () => {
    const text = typedText || PRACTICE_TEXT;
    setReaderMode(true);
    setReaderText(text);
    readerTextRef.current = text;
    setCharIndex(0);
    charIndexRef.current = 0;
    sayPrompt(
      typedText
        ? 'Reader mode. Reading what you typed. Swipe right for next character, left for previous. Hold the button below for the full word.'
        : 'Reader mode with practice text. Swipe right for next character, left for previous. Hold the button below for the full word.'
    );
  };

  const currentChar = readerText[charIndex] || '';
  const feedbackLabel = feedbackMode === 'both' ? 'Voice and haptic' : feedbackMode === 'haptic' ? 'Haptic only' : 'Voice only';

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Braille"
        icon={Hand}
        color={Colors.warning}
        textColor={Colors.onAccent}
        right={
          <>
            <Pressable
              onPress={cycleFeedbackMode}
              style={styles.modeBadge}
              accessibilityRole="button"
              accessibilityLabel={`Feedback: ${feedbackLabel}. Tap to change.`}
            >
              {feedbackMode === 'haptic' ? <Vibrate color={Colors.white} size={16} /> : <Volume2 color={Colors.white} size={16} />}
              <Text style={styles.modeText}>{feedbackMode === 'both' ? 'V+H' : feedbackMode === 'haptic' ? 'HAP' : 'VOC'}</Text>
            </Pressable>
            <Pressable
              onPress={cycleSpeed}
              style={styles.speedBadge}
              accessibilityRole="button"
              accessibilityLabel={`Haptic speed ${speed}x. Tap to change.`}
            >
              <Text style={styles.modeText}>{speed}x</Text>
            </Pressable>
          </>
        }
      />

      {/* Toggle: Input vs Reader */}
      <View style={styles.toggleBar} accessibilityRole="tablist">
        <Pressable
          style={[styles.toggleBtn, !readerMode && styles.toggleActive]}
          onPress={enterInputMode}
          accessibilityRole="tab"
          accessibilityLabel="Input mode"
          accessibilityState={{ selected: !readerMode }}
        >
          <Text style={[styles.toggleText, !readerMode && styles.toggleTextActive]}>INPUT</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, readerMode && styles.toggleActive]}
          onPress={enterReaderMode}
          accessibilityRole="tab"
          accessibilityLabel="Reader mode"
          accessibilityState={{ selected: readerMode }}
        >
          <Text style={[styles.toggleText, readerMode && styles.toggleTextActive]}>READER</Text>
        </Pressable>
      </View>

      {!readerMode ? (
        <>
          {/* Text Display */}
          <View style={styles.textDisplay} accessible accessibilityLabel={typedText ? `Typed text: ${typedText}` : 'Nothing typed yet'}>
            <Text style={styles.typedText}>{typedText || 'Start typing...'}</Text>
          </View>

          {/* 6-Dot Braille Grid */}
          <View style={styles.brailleGrid}>
            <View style={styles.column}>
              {[0, 1, 2].map(i => (
                <Pressable
                  key={i}
                  style={[styles.dot, dots[i] && styles.dotActive]}
                  onPress={() => toggleDot(i)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Dot ${i + 1}`}
                  accessibilityState={{ checked: dots[i] }}
                />
              ))}
            </View>
            <View style={styles.column}>
              {[3, 4, 5].map(i => (
                <Pressable
                  key={i}
                  style={[styles.dot, dots[i] && styles.dotActive]}
                  onPress={() => toggleDot(i)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Dot ${i + 1}`}
                  accessibilityState={{ checked: dots[i] }}
                />
              ))}
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <Pressable style={[styles.controlBtn, { backgroundColor: Colors.error }]} onPress={deleteChar} accessibilityRole="button" accessibilityLabel="Delete last letter">
              <Text style={styles.btnText}>Delete</Text>
            </Pressable>
            <Pressable style={[styles.controlBtn, { backgroundColor: Colors.modeBlind }]} onPress={speakAll} accessibilityRole="button" accessibilityLabel="Speak typed text">
              <Text style={styles.btnText}>Speak</Text>
            </Pressable>
            <Pressable style={[styles.controlBtn, { backgroundColor: Colors.success }]} onPress={submitCharacter} accessibilityRole="button" accessibilityLabel="Enter letter from selected dots">
              <Text style={[styles.btnText, { color: Colors.onAccent }]}>Enter</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {/* Haptic Reader Zone */}
          <View style={styles.readerInfo}>
            <Text style={styles.readerLabel}>{readerText === PRACTICE_TEXT && !typedText ? 'Practice text:' : 'Reading:'}</Text>
            <Text style={styles.readerFullText}>{readerText}</Text>
          </View>

          <View style={styles.readerCharDisplay} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text style={styles.readerCharLabel}>Current Character</Text>
            <Text style={styles.readerChar}>{currentChar === ' ' ? '⎵' : currentChar.toUpperCase()}</Text>
            <Text style={styles.readerPosition}>{charIndex + 1} / {readerText.length}</Text>

            {/* Dot visualization */}
            <View style={styles.dotPreview}>
              {(BRAILLE[currentChar.toLowerCase()] || [0,0,0,0,0,0]).map((d, i) => (
                <View key={i} style={[styles.previewDot, d === 1 && styles.previewDotOn]} />
              ))}
            </View>
          </View>

          {/* Gesture surface: swipes without a screen reader, adjustable control with one */}
          <View
            style={styles.gestureZone}
            {...panResponder.panHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Braille reader"
            accessibilityValue={{ text: `${currentChar === ' ' ? 'space' : currentChar}, character ${charIndex + 1} of ${readerText.length}` }}
            accessibilityHint="Swipe up for next character, down for previous. Double tap to repeat."
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }, { name: 'longpress' }]}
            onAccessibilityAction={handleReaderAccessibilityAction}
          >
            <Text style={styles.gestureHint}>← Swipe to Navigate →</Text>
            <Text style={styles.gestureSubHint}>Tap to repeat</Text>
          </View>

          <Pressable
            style={styles.longPressBtn}
            onLongPress={handleLongPressWord}
            delayLongPress={600}
            accessibilityRole="button"
            accessibilityLabel="Play full word"
            accessibilityHint="Long press to feel and hear the whole current word"
            accessibilityActions={[{ name: 'activate' }, { name: 'longpress' }]}
            onAccessibilityAction={() => handleLongPressWord()}
          >
            <Text style={styles.longPressBtnText}>HOLD FOR FULL WORD</Text>
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 16 },
  modeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.glassTertiary, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.borderGlassSubtle,
  },
  speedBadge: {
    backgroundColor: Colors.glassTertiary, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.borderGlassSubtle,
  },
  modeText: { color: Colors.white, fontSize: 12, fontWeight: '700' },

  // Toggle bar
  toggleBar: {
    flexDirection: 'row', backgroundColor: Colors.glassTertiary, borderRadius: 16,
    padding: 4, marginBottom: 16,
  },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  toggleActive: { backgroundColor: Colors.warning },
  toggleText: { color: Colors.textSubtle, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  toggleTextActive: { color: Colors.onAccent },

  // Input mode
  textDisplay: {
    backgroundColor: Colors.glassTertiary, padding: 24, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.borderGlassSubtle, minHeight: 100,
    justifyContent: 'center', marginBottom: 24,
  },
  typedText: {
    color: Colors.white, fontSize: Typography.sizes.title1, fontWeight: '700',
    textAlign: 'center', letterSpacing: 2,
  },
  brailleGrid: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 56,
  },
  column: { gap: 32 },
  dot: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 2,
    borderColor: Colors.borderGlass, backgroundColor: Colors.glassSecondary,
  },
  dotActive: {
    backgroundColor: Colors.warning, borderColor: Colors.warning,
    shadowColor: Colors.warning, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 16,
  },
  controls: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 16,
  },
  controlBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: Typography.sizes.headline },

  // Reader mode
  readerInfo: {
    backgroundColor: Colors.glassTertiary, padding: 16, borderRadius: 16,
    marginBottom: 16, borderWidth: 1, borderColor: Colors.borderGlassSubtle,
  },
  readerLabel: { color: Colors.textSubtle, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  readerFullText: { color: Colors.white, fontSize: 16, fontWeight: '600', letterSpacing: 1 },
  readerCharDisplay: {
    alignItems: 'center', backgroundColor: Colors.glassSecondary, padding: 24,
    borderRadius: 24, borderWidth: 1, borderColor: Colors.borderGlassSubtle, marginBottom: 16,
  },
  readerCharLabel: { color: Colors.textSubtle, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  readerChar: {
    color: Colors.warning, fontSize: 72, fontWeight: '800', letterSpacing: 4,
  },
  readerPosition: { color: Colors.textSubtle, fontSize: 14, marginTop: 8, fontWeight: '600' },
  dotPreview: {
    flexDirection: 'row', gap: 8, marginTop: 16,
  },
  previewDot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.glassTertiary, borderWidth: 1, borderColor: Colors.borderGlass,
  },
  previewDotOn: {
    backgroundColor: Colors.warning, borderColor: Colors.warning,
  },
  gestureZone: {
    flex: 1, backgroundColor: Colors.glassTertiary, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.borderGlass, borderStyle: 'dashed',
    marginBottom: 16,
  },
  gestureHint: {
    color: Colors.white, fontSize: 20, fontWeight: '700', letterSpacing: 2,
  },
  gestureSubHint: {
    color: Colors.textSubtle, fontSize: 13, marginTop: 8,
  },
  longPressBtn: {
    backgroundColor: Colors.warning, padding: 20, borderRadius: 20,
    alignItems: 'center', marginBottom: 16,
    shadowColor: Colors.warning, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
  },
  longPressBtnText: {
    color: Colors.onAccent, fontSize: 16, fontWeight: '800', letterSpacing: 2,
  },
});
