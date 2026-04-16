import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { SurfaceCard } from '../../../components/SurfaceCard';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type Metric = { label: string; icon: string; value: string; highlight?: boolean };

export function MetricsRow({ metrics }: { metrics: Metric[] }) {
  return (
    <View style={styles.metricsRow}>
      {metrics.map((metric) => (
        <SurfaceCard key={metric.label} style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Icon name={metric.icon} size={16} color={colors.subduedText} />
            <Text style={styles.metricLabel}>{metric.label}</Text>
          </View>
          <Text style={[styles.metricValue, metric.highlight && styles.metricValueHighlight]}>
            {metric.value}
          </Text>
        </SurfaceCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  metricCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricLabel: {
    fontSize: scaleFont(13),
    color: colors.subduedText,
  },
  metricValue: {
    marginTop: spacing.xs,
    fontSize: scaleFont(20),
    fontWeight: '700',
    color: colors.text,
  },
  metricValueHighlight: {
    color: colors.success,
  },
});
