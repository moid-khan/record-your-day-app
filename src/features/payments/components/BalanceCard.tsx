import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { Button } from '../../../components/Button';
import { SurfaceCard } from '../../../components/SurfaceCard';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type BalanceCardProps = {
  available: number;
  pending: number;
  onWithdraw?: () => void;
};

export function BalanceCard({ available, pending, onWithdraw }: BalanceCardProps) {
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.headerRow}>
        <Icon name="credit-card" size={18} color={colors.primarySurface} />
        <Text style={styles.subtitle}>Available Balance</Text>
      </View>

      <Text style={styles.amount}>${available.toFixed(2)}</Text>

      <View style={styles.actionsRow}>
        <Button
          title="Withdraw"
          variant="secondary"
          onPress={onWithdraw}
          textStyle={styles.secondaryButtonText}
          style={styles.secondaryButton}
          leftIcon={<Icon name="send" size={18} color={colors.primary} />}
        />
        <View style={styles.pendingPill}>
          <Text style={styles.pendingLabel}>Pending</Text>
          <Text style={styles.pendingAmount}>${pending.toFixed(2)}</Text>
        </View>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    padding: spacing.xl,
    borderRadius: radii.xl,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.primarySurface,
    fontSize: scaleFont(14),
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  amount: {
    fontSize: scaleFont(36),
    fontWeight: '700',
    color: colors.surface,
    marginBottom: spacing.lg,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    marginRight: spacing.md,
  },
  secondaryButtonText: {
    color: colors.primary,
  },
  pendingPill: {
    flex: 1,
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  pendingLabel: {
    color: colors.primarySurface,
    fontSize: scaleFont(13),
    fontWeight: '600',
  },
  pendingAmount: {
    color: colors.surface,
    fontSize: scaleFont(16),
    fontWeight: '700',
    marginTop: spacing.xs,
  },
});
