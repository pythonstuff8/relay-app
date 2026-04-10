import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, PanResponder, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography } from '../../constants/theme';
import { ArrowLeft, Hand, Volume2, Vibrate } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

// ─── COMPLETE GRADE-1 BRAILLE MAPPING ───
// Standard 6-dot cell: [1,2,3,4,5,6] → dots in columns (left: 1-2-3, right: 4-5-6)
// Value 1 = raised dot, 0 = flat
const BRAILLE: Record<string, number[]> = {
  a: [1,0,0,0,0,0], b: [1,1,0,0,0,0], c: [1,0,0,1,0,0],
  d: [1,0,0,1,1,0], e: [1,0,0,0,1,0], f: [1,1,0,1,0,0],
  g: [1,1,0,1,1,0], h: [1,1,0,0,1,0], i: [0,1,0,1,0,0],
  j: [0,1,0,1,1,0], k: [1,0,1,0,0,0], l: [1,1,1,0,0,0],
  m: [1,0,1,1,0,0], n: [1,0,1,1,1,0], o: [1,0,1,0,1,0],
  p: [1,1,1,1,0,0], q: [1,1,1,1,1,0], r: [1,1,1,0,1,0],
  s: [0,1,1,1,0,0], t: [0,1,1,1,1,0], u: [1,0,1,0,0,1],
  v: [1,1,1,0,0,1], w: [0,1,0,1,1,1], x: [1,0,1,1,0,1],
  y: [1,0,1,1,1,1], z: [1,0,1,0,1,1],
  ' ': [0,0,0,0,0,0],
  '.': [0,1,0,0,1,1], ',': [0,1,0,0,0,0],
  '!': [0,1,1,0,1,0], '?': [0,1,1,0,0,1],
  '-': [0,0,1,0,0,1], "'": [0,0,1,0,0,0],
};

// Reverse map for input (dot pattern → character)
const BRAILLE_INPUT: Record<string, string> = {};
for (const [char, dots] of Object.entries(BRAILLE)) {
  BRAILLE_INPUT[dots.join('')] = char;
}

// ─── TIMING CONSTANTS ───
const DOT_ON_MS = 80;        // Duration of a "raised dot" pulse
const DOT_OFF_MS = 60;       // Gap between dots within a cell
const LETTER_GAP_MS = 400;   // Gap between characters
const WORD_GAP_MS = 700;     // Gap for space character

// ─── HAPTIC PLAYBACK ENGINE ───
type FeedbackMode = 'haptic' | 'voice' | 'both';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function playBrailleCell(dots: number[], speed: number = 1.0) {
  const dotOn = DOT_ON_MS / speed;
  const dotOff = DOT_OFF_MS / speed;

  for (let i = 0; i < dots.length; i++) {
    if (dots[i] === 1) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (i < dots.length - 1) await sleep(dotOff);
  }
}

async function playCharacterHaptic(char: string, speed: number = 1.0) {
  const lower = char.toLowerCase();
  const dots = BRAILLE[lower];
  if (!dots) {
    // Unknown character — triple warning buzz
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return;
  }
  if (lower === ' ') {
    await sleep(WORD_GAP_MS / speed);
    return;
  }
  await playBrailleCell(dots, speed);
}

async function playWordHaptic(word: string, speed: number = 1.0) {
  for (let i = 0; i < word.length; i++) {
    await playCharacterHaptic(word[i], speed);
    if (i < word.length - 1) await sleep(LETTER_GAP_MS / speed);
  }
}

// ─── COMPONENT ───
const { width: SCREEN_W } = Dimensions.get('window');
const SWIPE_THRESHOLD = 50;

export default function BrailleMode() {
  const router = useRouter();

  // Braille Input State
  const [dots, setDots] = useState([false, false, false, false, false, false]);
  const [typedText, setTypedText] = useState('');

  // Haptic Reader State
  const [readerMode, setReaderMode] = useState(false);
  const [readerText, setReaderText] = useState('hello world');
  const [charIndex, setCharIndex] = useState(0);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('both');
  const [speed, setSpeed] = useState(1.0);
  const playingRef = useRef(false);

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
    const char = BRAILLE_INPUT[key] || '?';
    setTypedText(prev => prev + char);
    if (feedbackMode !== 'haptic') {
      Speech.speak(char === '?' ? 'Unknown' : char === ' ' ? 'Space' : char);
    }
    setDots([false, false, false, false, false, false]);
  };

  const deleteChar = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setTypedText(prev => prev.slice(0, -1));
    if (feedbackMode !== 'haptic') Speech.speak('Deleted');
  };

  const speakAll = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak(typedText || 'Nothing typed yet');
  };

  // ─── Haptic Reader ───
  const emitCharacter = useCallback(async (text: string, idx: number) => {
    if (idx < 0 || idx >= text.length) return;
    const char = text[idx];
    if (feedbackMode === 'haptic' || feedbackMode === 'both') {
      await playCharacterHaptic(char, speed);
    }
    if (feedbackMode === 'voice' || feedbackMode === 'both') {
      Speech.speak(char === ' ' ? 'Space' : char);
    }
  }, [feedbackMode, speed]);

  const handleLongPressWord = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    const text = readerText || typedText;
    if (!text) { playingRef.current = false; return; }

    // Find current word boundaries
    let start = charIndex;
    let end = charIndex;
    while (start > 0 && text[start - 1] !== ' ') start--;
    while (end < text.length && text[end] !== ' ') end++;
    const word = text.slice(start, end);

    if (feedbackMode === 'haptic' || feedbackMode === 'both') {
      await playWordHaptic(word, speed);
    }
    if (feedbackMode === 'voice' || feedbackMode === 'both') {
      Speech.speak(word);
    }
    playingRef.current = false;
  }, [readerText, typedText, charIndex, feedbackMode, speed]);

  // ─── Gesture Handler ───
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gesture) => {
        const text = readerText || typedText;
        if (!text) return;

        if (Math.abs(gesture.dx) < SWIPE_THRESHOLD && Math.abs(gesture.dy) < SWIPE_THRESHOLD) {
          // Tap — repeat current
          setCharIndex(prev => {
            const idx = Math.min(prev, text.length - 1);
            emitCharacter(text, idx);
            return idx;
          });
        } else if (gesture.dx > SWIPE_THRESHOLD) {
          // Swipe right → next character
          setCharIndex(prev => {
            const next = Math.min(prev + 1, text.length - 1);
            emitCharacter(text, next);
            return next;
          });
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          // Swipe left → previous character
          setCharIndex(prev => {
            const next = Math.max(prev - 1, 0);
            emitCharacter(text, next);
            return next;
          });
        }
      },
    })
  ).current;

  const handleBack = () => {
    Speech.stop();
    Haptics.selectionAsync();
    router.back();
  };

  const cycleFeedbackMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFeedbackMode(prev => {
      const next = prev === 'both' ? 'haptic' : prev === 'haptic' ? 'voice' : 'both';
      Speech.speak(`Mode: ${next === 'both' ? 'Voice and Haptic' : next === 'haptic' ? 'Haptic only' : 'Voice only'}`);
      return next;
    });
  };

  const cycleSpeed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSpeed(prev => {
      const next = prev >= 2.0 ? 0.5 : prev + 0.5;
      Speech.speak(`Speed ${next}x`);
      return next;
    });
  };

  const activeText = readerText || typedText;
  const currentChar = activeText?.[charIndex] || '';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} accessibilityLabel="Go back">
          <ArrowLeft color={Colors.white} size={28} />
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable onPress={cycleFeedbackMode} style={styles.modeBadge} accessibilityLabel={`Feedback mode: ${feedbackMode}`}>
            {feedbackMode === 'haptic' ? <Vibrate color={Colors.white} size={16} /> : <Volume2 color={Colors.white} size={16} />}
            <Text style={styles.modeText}>{feedbackMode === 'both' ? 'V+H' : feedbackMode === 'haptic' ? 'HAP' : 'VOC'}</Text>
          </Pressable>
          <Pressable onPress={cycleSpeed} style={styles.speedBadge} accessibilityLabel={`Speed ${speed}x`}>
            <Text style={styles.modeText}>{speed}x</Text>
          </Pressable>
          <View style={styles.indicatorBox}>
            <Hand color={Colors.white} size={18} style={{ marginRight: 6 }} />
            <Text style={styles.title}>Braille</Text>
          </View>
        </View>
      </View>

      {/* Toggle: Input vs Reader */}
      <View style={styles.toggleBar}>
        <Pressable
          style={[styles.toggleBtn, !readerMode && styles.toggleActive]}
          onPress={() => { setReaderMode(false); Speech.speak('Input mode'); }}
        >
          <Text style={[styles.toggleText, !readerMode && styles.toggleTextActive]}>INPUT</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, readerMode && styles.toggleActive]}
          onPress={() => {
            setReaderMode(true);
            setReaderText(typedText || 'hello world');
            setCharIndex(0);
            Speech.speak('Reader mode. Swipe right for next character. Swipe left for previous. Long press for full word.');
          }}
        >
          <Text style={[styles.toggleText, readerMode && styles.toggleTextActive]}>READER</Text>
        </Pressable>
      </View>

      {/* Content */}
      {!readerMode ? (
        <>
          {/* Text Display */}
          <View style={styles.textDisplay}>
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
                  accessibilityLabel={`Dot ${i + 1}, ${dots[i] ? 'raised' : 'flat'}`}
                />
              ))}
            </View>
            <View style={styles.column}>
              {[3, 4, 5].map(i => (
                <Pressable
                  key={i}
                  style={[styles.dot, dots[i] && styles.dotActive]}
                  onPress={() => toggleDot(i)}
                  accessibilityLabel={`Dot ${i + 1}, ${dots[i] ? 'raised' : 'flat'}`}
                />
              ))}
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <Pressable style={[styles.controlBtn, { backgroundColor: Colors.error }]} onPress={deleteChar}>
              <Text style={styles.btnText}>Delete</Text>
            </Pressable>
            <Pressable style={[styles.controlBtn, { backgroundColor: Colors.modeBlind }]} onPress={speakAll}>
              <Text style={styles.btnText}>Speak</Text>
            </Pressable>
            <Pressable style={[styles.controlBtn, { backgroundColor: Colors.success }]} onPress={submitCharacter}>
              <Text style={styles.btnText}>Enter</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {/* Haptic Reader Zone */}
          <View style={styles.readerInfo}>
            <Text style={styles.readerLabel}>Reading:</Text>
            <Text style={styles.readerFullText}>{activeText}</Text>
          </View>

          <View style={styles.readerCharDisplay}>
            <Text style={styles.readerCharLabel}>Current Character</Text>
            <Text style={styles.readerChar}>{currentChar === ' ' ? '⎵' : currentChar.toUpperCase()}</Text>
            <Text style={styles.readerPosition}>{charIndex + 1} / {activeText.length}</Text>

            {/* Dot visualization */}
            <View style={styles.dotPreview}>
              {(BRAILLE[currentChar.toLowerCase()] || [0,0,0,0,0,0]).map((d, i) => (
                <View key={i} style={[styles.previewDot, d === 1 && styles.previewDotOn]} />
              ))}
            </View>
          </View>

          {/* Gesture surface */}
          <View style={styles.gestureZone} {...panResponder.panHandlers}>
            <Text style={styles.gestureHint}>← Swipe to Navigate →</Text>
            <Text style={styles.gestureSubHint}>Tap to repeat • Long press for word</Text>
          </View>

          <Pressable style={styles.longPressBtn} onLongPress={handleLongPressWord} delayLongPress={600}>
            <Text style={styles.longPressBtnText}>HOLD FOR FULL WORD</Text>
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 16 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16, marginTop: 8,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: {
    padding: 12, backgroundColor: Colors.glassSecondary, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.borderGlassSubtle,
  },
  indicatorBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warning,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  title: { color: Colors.white, fontSize: Typography.sizes.body, fontWeight: '700' },
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
  toggleTextActive: { color: Colors.white },

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
    color: Colors.white, fontSize: 16, fontWeight: '800', letterSpacing: 2,
  },
});
