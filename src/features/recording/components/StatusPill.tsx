import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type Props = {
  label: string;
  status: 'idle' | 'loading' | 'ready' | 'listening' | 'error';
};

export function StatusPill({ label, status }: Props) {
  const palette = getPalette(status);
  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <View style={[styles.dot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.text, { color: palette.fg }]}>
        {label}: {status}
      </Text>
    </View>
  );
}

function getPalette(status: Props['status']) {
  switch (status) {
    case 'ready':
    case 'listening':
      return { fg: colors.success, bg: colors.successSurface };
    case 'loading':
      return { fg: colors.primary, bg: colors.primarySurface };
    case 'error':
      return { fg: colors.warning, bg: '#fff4e5' };
    default:
      return { fg: colors.subduedText, bg: colors.surfaceMuted };
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  text: {
    fontSize: scaleFont(13),
    fontWeight: '600',
  },
});
