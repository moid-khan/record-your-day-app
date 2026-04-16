import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { SurfaceCard } from '../components/SurfaceCard';
import { BalanceCard } from '../features/payments/components/BalanceCard';
import { StatCard } from '../features/payments/components/StatCard';
import { TransactionItem } from '../features/payments/components/TransactionItem';
import { WithdrawCard } from '../features/payments/components/WithdrawCard';
import { mockTransactions } from '../features/payments/data/mockTransactions';
import { Transaction } from '../features/payments/types';
import { colors, spacing } from '../theme';

export function PaymentsScreen() {
  const [amount, setAmount] = useState('50');
  const [available, setAvailable] = useState(215.5);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [withdrawRendered, setWithdrawRendered] = useState(false);
  const withdrawAnim = useMemo(() => new Animated.Value(0), []);
  const balancePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (withdrawVisible) {
      setWithdrawRendered(true);
      Animated.timing(withdrawAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(withdrawAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setWithdrawRendered(false);
      }
    });
  }, [withdrawVisible, withdrawAnim]);

  const handleConfirmWithdraw = () => {
    const value = parseFloat(amount);
    if (Number.isNaN(value) || value <= 0 || value > available) {
      return;
    }

    const newBalance = Math.max(0, available - value);
    setAvailable(newBalance);

    const newTransaction: Transaction = {
      id: `${Date.now()}`,
      title: 'Withdrawal',
      subtitle: 'Just now',
      amount: -value,
      direction: 'debit',
    };
    setTransactions((prev) => [newTransaction, ...prev]);

    Animated.sequence([
      Animated.timing(balancePulse, {
        toValue: 1.04,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.spring(balancePulse, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    setWithdrawVisible(false);
    setAmount('50');
  };

  return (
    <ScreenContainer
      scrollable
      contentContainerStyle={styles.content}
    >
      <Text style={styles.pageTitle}>Record Your Day</Text>

      <Animated.View
        style={[
          styles.section,
          {
            transform: [{ scale: balancePulse }],
          },
        ]}
      >
        <BalanceCard
          available={available}
          pending={0}
          onWithdraw={() => setWithdrawVisible(true)}
        />
      </Animated.View>

      {withdrawRendered ? (
        <Animated.View
          style={[
            styles.section,
            {
              opacity: withdrawAnim,
              transform: [
                {
                  translateY: withdrawAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <WithdrawCard
            amount={amount}
            onAmountChange={setAmount}
            quickAmounts={[25, 50, 100]}
            onSelectQuickAmount={(value) => setAmount(String(value))}
            transferNote="Instant transfer to linked bank account"
            onCancel={() => {
              setAmount('50');
              setWithdrawVisible(false);
            }}
            onConfirm={handleConfirmWithdraw}
          />
        </Animated.View>
      ) : null}

      <View style={[styles.statsRow, styles.section]}>
        <StatCard
          label="This Week"
          value="+$145.00"
          iconName="trending-up"
          valueColor={colors.success}
          style={styles.statCardSpacing}
        />
        <StatCard
          label="Total Earned"
          value="$1,847.50"
          iconName="file-text"
        />
      </View>

      <Text style={[styles.sectionTitle, styles.sectionTopSpacing]}>
        Recent Transactions
      </Text>
      <SurfaceCard style={styles.sectionCard}>
        {transactions.map((transaction, index) => (
          <View key={transaction.id}>
            <TransactionItem transaction={transaction} />
            {index < transactions.length - 1 ? (
              <View style={styles.divider} />
            ) : null}
          </View>
        ))}
      </SurfaceCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.lg,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text,
    marginTop: spacing.md,
  },
  section: {
    marginTop: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statCardSpacing: {
    marginRight: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xs,
  },
  sectionTopSpacing: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionCard: {
    marginTop: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
