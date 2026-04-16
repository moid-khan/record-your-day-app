import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { Button } from '../../../components/Button';
import { Chip } from '../../../components/Chip';
import { SurfaceCard } from '../../../components/SurfaceCard';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type WithdrawCardProps = {
  amount: string;
  onAmountChange: (value: string) => void;
  quickAmounts: number[];
  onSelectQuickAmount: (value: number) => void;
  transferNote?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
};

export function WithdrawCard({
  amount,
  onAmountChange,
  quickAmounts,
  onSelectQuickAmount,
  transferNote,
  onCancel,
  onConfirm,
}: WithdrawCardProps) {
  return (
    <SurfaceCard>
      <Text style={styles.title}>Withdraw Funds</Text>
      <Text style={styles.label}>Amount</Text>

      <View style={styles.inputRow}>
        <Text style={styles.prefix}>$</Text>
        <TextInput
          value={amount}
          onChangeText={onAmountChange}
          placeholder="0.00"
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor={colors.subduedText}
        />
      </View>

      <View style={styles.chipsRow}>
        {quickAmounts.map((value) => (
          <Chip
            key={value}
            label={`$${value}`}
            onPress={() => onSelectQuickAmount(value)}
            selected={amount === String(value)}
            style={styles.chip}
          />
        ))}
      </View>

      {transferNote ? (
        <View style={styles.noteRow}>
          <View style={styles.noteIcon}>
            <Icon name="check-circle" size={18} color={colors.primary} />
          </View>
          <Text style={styles.noteText}>{transferNote}</Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <Button
          title="Cancel"
          variant="secondary"
          onPress={onCancel}
          textStyle={styles.cancelText}
          style={[styles.actionButton, styles.actionButtonSpacing]}
        />
        <Button
          title="Confirm"
          onPress={onConfirm}
          style={styles.actionButton}
        />
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: colors.subduedText,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  prefix: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: colors.subduedText,
  },
  input: {
    flex: 1,
    fontSize: scaleFont(16),
    fontWeight: '600',
    paddingVertical: spacing.sm,
    marginLeft: spacing.sm,
    color: colors.text,
  },
  chipsRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  chip: {
    marginRight: spacing.sm,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noteIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: colors.subduedText,
    marginLeft: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  actionButtonSpacing: {
    marginRight: spacing.sm,
  },
  cancelText: {
    color: colors.text,
  },
});
