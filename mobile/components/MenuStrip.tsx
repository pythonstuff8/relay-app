import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, Typography } from '../constants/theme';

type Props = {
  title: string;
  description?: string;
  icon: LucideIcon;
  color: string;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
};

// Large full-width menu option, sized for low-vision users and easy to hit without looking.
export function MenuStrip({ title, description, icon: Icon, color, onPress, accessibilityLabel, disabled }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.strip, pressed && styles.pressed, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <View style={[styles.iconBox, { borderColor: color }]}>
        <Icon color={color} size={34} />
      </View>
      <View style={styles.textBox}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flex: 1,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.glassTertiary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  pressed: { backgroundColor: Colors.glassSecondary },
  disabled: { opacity: 0.45 },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 18,
  },
  textBox: { flex: 1 },
  title: {
    color: Colors.white,
    fontSize: Typography.sizes.title3,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  description: {
    color: Colors.textSubtle,
    fontSize: Typography.sizes.body,
    marginTop: 4,
  },
});
