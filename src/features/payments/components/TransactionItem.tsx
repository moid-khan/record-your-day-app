import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';
import { Transaction } from '../types';

type TransactionItemProps = {
  transaction: Transaction;
};

export function TransactionItem({ transaction }: TransactionItemProps) {
  const isCredit = transaction.direction === 'credit';
  const amountDisplay = `${isCredit ? '+' : '-'}$${Math.abs(transaction.amount).toFixed(2)}`;
  const iconTint = isCredit ? colors.success : colors.warning;
  const iconBackground = isCredit ? colors.successSurface : colors.surfaceMuted;

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: iconBackground }]}>
        <Icon
          name={isCredit ? 'trending-up' : 'trending-down'}
          size={16}
          color={iconTint}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{transaction.title}</Text>
        <Text style={styles.subtitle}>{transaction.subtitle}</Text>
      </View>
      <Text style={[styles.amount, { color: isCredit ? colors.success : colors.warning }]}>
        {amountDisplay}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: scaleFont(13),
    color: colors.subduedText,
    marginTop: spacing.xs,
  },
  amount: {
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});
