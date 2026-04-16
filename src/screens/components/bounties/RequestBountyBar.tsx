import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type Props = {
  tasksAvailable: number;
  onPress: () => void;
};

export function RequestBountyBar({ tasksAvailable, onPress }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.tasksText}>{tasksAvailable} tasks available</Text>
      <Pressable style={styles.requestButton} onPress={onPress}>
        <Icon name="plus" size={16} color={colors.surface} />
        <Text style={styles.requestText}>Request Bounty</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tasksText: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.xl,
  },
  requestText: {
    color: colors.surface,
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});
