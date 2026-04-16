import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { colors, spacing } from '../../theme';
import { scaleFont } from '../../theme/scale';

type StepHeaderProps = {
  title: string;
  step: number;
  totalSteps: number;
  progress?: SharedValue<number>;
  showStepper?: boolean;
};

export function StepHeader({
  title,
  step,
  totalSteps,
  progress,
  showStepper = true,
}: StepHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {showStepper ? (
        <>
          <View style={styles.segments}>
            {new Array(totalSteps).fill(null).map((_, idx) => (
              <StepSegment key={idx} index={idx} step={step} progress={progress} />
            ))}
          </View>
          <Text style={styles.stepLabel}>Step {step + 1} of {totalSteps}</Text>
        </>
      ) : null}
    </View>
  );
}

function StepSegment({
  index,
  step,
  progress,
}: {
  index: number;
  step: number;
  progress?: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const raw = progress ? progress.value : step;
    const fill = Math.min(Math.max(raw - index + 1, 0), 1);
    return { width: `${fill * 100}%` };
  }, [progress, step, index]);

  return (
    <View style={styles.segmentTrack}>
      <Animated.View style={[styles.segmentFill, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: scaleFont(24),
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  segments: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  segmentTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 999,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  stepLabel: {
    textAlign: 'center',
    color: colors.subduedText,
    fontSize: scaleFont(14),
    fontWeight: '600',
  },
});
