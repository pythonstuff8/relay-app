import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { History, X } from 'lucide-react-native';
import { Colors, Typography } from '../constants/theme';
import { catchUpSummary } from '../utils/ai';
import { describeError } from '../utils/relayApi';

type Props = {
  lines: string[];
  languageName: string;
  keywords: string[];
};

// "What did I miss?": summarizes the most recent captions in a few bullets.
export function CatchUpButton({ lines, languageName, keywords }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');

  const run = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOpen(true);
    if (lines.length === 0) {
      setSummary('Nothing has been captioned yet.');
      return;
    }
    setBusy(true);
    setSummary('');
    try {
      setSummary(await catchUpSummary(lines.slice(-60), languageName, keywords));
    } catch (error) {
      setSummary(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={run}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="Catch me up"
        accessibilityHint="Summarizes the most recent captions"
      >
        <History color={Colors.white} size={20} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} accessibilityRole="header">What you missed</Text>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
                <X color={Colors.white} size={28} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {busy ? (
                <ActivityIndicator color={Colors.white} size="large" style={{ marginVertical: 32 }} />
              ) : (
                <Text style={styles.summary} accessibilityLiveRegion="polite">{summary}</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 10,
    borderRadius: 18,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#1C1C1F',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { color: Colors.white, fontSize: Typography.sizes.title2, fontWeight: '800' },
  summary: { color: Colors.white, fontSize: Typography.sizes.title3, lineHeight: 32 },
});
