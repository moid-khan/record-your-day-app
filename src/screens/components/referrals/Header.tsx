import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

export function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Record Your Day</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: scaleFont(24),
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
});
