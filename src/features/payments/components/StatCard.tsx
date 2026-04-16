import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type StatCardProps = {
  label: string;
  value: string;
  iconName: string;
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
};

export function StatCard({
  label,
  value,
  iconName,
  valueColor = colors.text,
  style,
}: StatCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.iconRow}>
        <Icon name={iconName} size={18} color={colors.subduedText} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: colors.subduedText,
    marginLeft: spacing.sm,
  },
  value: {
    fontSize: scaleFont(18),
    fontWeight: '700',
  },
});
