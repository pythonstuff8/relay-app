import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BellRing } from 'lucide-react-native';
import { Colors, Typography } from '../constants/theme';
import { splitByKeywords } from '../utils/keywords';

type Alert = { keyword: string; sentence: string } | null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Shows a banner and vibrates three times when a keyword is heard.
export function useNameAlert() {
  const [alert, setAlert] = useState<Alert>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(async (keyword: string, sentence: string) => {
    setAlert({ keyword, sentence });
    AccessibilityInfo.announceForAccessibility(`${keyword} was mentioned: ${sentence}`);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAlert(null), 8000);
    for (let i = 0; i < 3; i++) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await sleep(300);
    }
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { alert, trigger, dismiss: () => setAlert(null) };
}

export function NameAlertBanner({ alert, onDismiss }: { alert: Alert; onDismiss: () => void }) {
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (!alert) return;
    scale.setValue(0.9);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [alert, scale]);

  if (!alert) return null;
  return (
    <Animated.View style={[styles.banner, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onDismiss}
        style={styles.inner}
        accessibilityRole="alert"
        accessibilityLabel={`${alert.keyword} was mentioned. ${alert.sentence}. Tap to dismiss.`}
      >
        <BellRing color={Colors.onAccent} size={26} />
        <Text style={styles.text}>
          <Text style={styles.title}>{`"${alert.keyword}" was said: `}</Text>
          {alert.sentence}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// Caption text with keywords highlighted.
export function HighlightedText({ text, keywords, style }: { text: string; keywords: string[]; style: object }) {
  return (
    <Text style={style}>
      {splitByKeywords(text, keywords).map((part, index) =>
        part.match ? (
          <Text key={index} style={styles.highlight}>{part.text}</Text>
        ) : (
          <Text key={index}>{part.text}</Text>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 20,
    backgroundColor: Colors.modeLoud,
    marginBottom: 12,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  text: { flex: 1, color: Colors.onAccent, fontSize: Typography.sizes.body, lineHeight: 24 },
  title: { fontWeight: '900' },
  highlight: { backgroundColor: Colors.modeLoud, color: Colors.onAccent, fontWeight: '800' },
});
