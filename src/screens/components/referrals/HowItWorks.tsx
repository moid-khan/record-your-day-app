import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SurfaceCard } from '../../../components/SurfaceCard';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type Step = { title: string; body: string };

export function HowItWorks({ steps }: { steps: Step[] }) {
  return (
    <SurfaceCard style={styles.howCard}>
      <Text style={styles.howTitle}>How it Works</Text>
      {steps.map((item, idx) => (
        <View key={item.title} style={styles.howRow}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>{idx + 1}</Text>
          </View>
          <View style={styles.howInfo}>
            <Text style={styles.howItemTitle}>{item.title}</Text>
            <Text style={styles.howItemBody}>{item.body}</Text>
          </View>
        </View>
      ))}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  howCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.text,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  howTitle: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    color: colors.text,
  },
  howRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: scaleFont(14),
    fontWeight: '700',
    color: colors.primary,
  },
  howInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  howItemTitle: {
    fontSize: scaleFont(15),
    fontWeight: '700',
    color: colors.text,
  },
  howItemBody: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
  },
});
