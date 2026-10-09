import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Typography } from '../constants/theme';
import { stopSpeaking } from '../utils/speech';

type Props = {
  title: string;
  icon?: LucideIcon;
  color?: string;
  textColor?: string;
  onBack?: () => void;
  right?: React.ReactNode;
};

export function ScreenHeader({ title, icon: Icon, color = Colors.glassPrimary, textColor = Colors.white, onBack, right }: Props) {
  const router = useRouter();

  const handleBack = () => {
    Haptics.selectionAsync();
    stopSpeaking();
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  return (
    <View style={styles.header}>
      <Pressable
        onPress={handleBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
      >
        <ArrowLeft color={Colors.white} size={28} />
      </Pressable>

      <View style={styles.right}>
        {right}
        <View style={[styles.badge, { backgroundColor: color }]} accessibilityRole="header">
          {Icon ? <Icon color={textColor} size={20} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 8,
  },
  backBtn: {
    padding: 12,
    backgroundColor: Colors.glassSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexShrink: 1,
  },
  title: {
    fontSize: Typography.sizes.body,
    fontWeight: '700',
  },
});
