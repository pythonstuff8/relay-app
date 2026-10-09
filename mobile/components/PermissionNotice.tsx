import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Typography } from '../constants/theme';
import { openAppSettings } from '../utils/audio';

type Props = {
  title: string;
  message: string;
  onRetry?: () => void;
};

export function PermissionNotice({ title, message, onRetry }: Props) {
  return (
    <View style={styles.box} accessible accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.row}>
        {onRetry ? (
          <Pressable style={[styles.btn, styles.secondary]} onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try again">
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.btn} onPress={openAppSettings} accessibilityRole="button" accessibilityLabel="Open Settings to allow access">
          <Text style={[styles.btnText, { color: Colors.onAccent }]}>Open Settings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    margin: 16,
    padding: 24,
    borderRadius: 24,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  title: { color: Colors.white, fontSize: Typography.sizes.title3, fontWeight: '800', marginBottom: 8 },
  message: { color: Colors.textSubtle, fontSize: Typography.sizes.body, lineHeight: 24 },
  row: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  secondary: { backgroundColor: Colors.glassPrimary },
  btnText: { color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '700' },
});
