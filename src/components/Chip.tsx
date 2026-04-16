import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle, StyleProp } from 'react-native';
import { colors, radii, spacing } from '../theme';
import { scaleFont } from '../theme/scale';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ label, selected = false, onPress, style }: ChipProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        selected && styles.selected,
        pressed && styles.pressed,
        style,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.label, selected && styles.selectedText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
  },
  pressed: {
    transform: [{ translateY: 1 }],
  },
  label: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: colors.text,
  },
  selectedText: {
    color: colors.primary,
  },
});
