import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors, spacing } from '../theme';
import { scaleFont } from '../theme/scale';

type PlaceholderScreenProps = {
  title: string;
  description?: string;
};

export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  return (
    <ScreenContainer>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.subtitle}>{description}</Text> : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: scaleFont(22),
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: scaleFont(15),
    color: colors.subduedText,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
