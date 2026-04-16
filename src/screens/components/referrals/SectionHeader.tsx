import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type Props = {
  title: string;
  subtitle?: string;
};

export function SectionHeader({ title, subtitle }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: scaleFont(15),
    fontWeight: '700',
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
  },
});
