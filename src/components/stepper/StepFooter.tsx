import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Button } from '../Button';
import { colors, spacing } from '../../theme';
import { scaleFont } from '../../theme/scale';

type StepFooterProps = {
  isLast: boolean;
  primaryLabel?: string;
  primaryContent?: React.ReactNode;
  disablePrimary?: boolean;
  onPrimary: () => void;
  onBack?: () => void;
  style?: ViewStyle;
};

export function StepFooter({
  isLast,
  primaryLabel,
  primaryContent,
  disablePrimary,
  onPrimary,
  onBack,
  style,
}: StepFooterProps) {
  return (
    <View style={[styles.footer, style]}>
      <Button
        title={primaryContent ? undefined : (primaryLabel || (isLast ? 'Get Started' : 'Continue'))}
        onPress={onPrimary}
        disabled={disablePrimary}
      >
        {primaryContent}
      </Button>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  backText: {
    color: colors.subduedText,
    fontSize: scaleFont(16),
    fontWeight: '600',
  },
});
