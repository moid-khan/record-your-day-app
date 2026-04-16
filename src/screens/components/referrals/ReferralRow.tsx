import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { SurfaceCard } from '../../../components/SurfaceCard';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

export type ReferralItem = {
  id: string;
  name: string;
  status: 'Completed' | 'Active';
  amount: number;
  date: string;
};

export function ReferralRow({ item }: { item: ReferralItem }) {
  return (
    <SurfaceCard style={styles.referralCard}>
      <View style={styles.referralRow}>
        <View style={styles.avatar}>
          <Icon name="user" size={20} color={colors.primary} />
        </View>
        <View style={styles.referralInfo}>
          <Text style={styles.referralName}>{item.name}</Text>
          <Text style={styles.referralDate}>{item.date}</Text>
        </View>
        <View style={{ gap: 5 }}>
          <View
            style={[
              styles.badge,
              item.status === 'Completed'
                ? styles.badgeSuccess
                : styles.badgeInfo,
            ]}
          >
            <Text style={[styles.badgeText]}>{item.status}</Text>
          </View>
          <Text
            style={[
              styles.referralAmount,
              item.status === 'Completed'
                ? styles.amountSuccess
                : styles.amountInfo,
            ]}
          >
            +${item.amount}
          </Text>
        </View>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  referralCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    shadowColor: colors.text,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  referralName: {
    fontSize: scaleFont(15),
    fontWeight: '700',
    color: colors.text,
  },
  referralDate: {
    fontSize: scaleFont(13),
    color: colors.subduedText,
  },
  badge: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeSuccess: {
    backgroundColor: colors.successSurface,
  },
  badgeInfo: {
    backgroundColor: colors.primarySurface,
  },
  badgeText: {
    fontSize: scaleFont(10),
    fontWeight: '500',
    color: colors.subduedText,
  },
  referralAmount: {
    fontSize: scaleFont(15),
    fontWeight: '700',
    textAlign: 'right',
  },
  amountSuccess: {
    color: colors.success,
  },
  amountInfo: {
    color: colors.primary,
  },
});
