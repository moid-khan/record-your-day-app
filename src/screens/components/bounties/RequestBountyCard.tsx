import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../../components/Button';
import { SurfaceCard } from '../../../components/SurfaceCard';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type Props = {
  onCancel: () => void;
  onSubmit: () => void;
};

export function RequestBountyCard({ onCancel, onSubmit }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  return (
    <SurfaceCard style={styles.card}>
      <Text style={styles.title}>Request a Custom Bounty</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Task Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Clean the garage"
          placeholderTextColor={colors.subduedText}
          style={styles.input}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the task..."
          placeholderTextColor={colors.subduedText}
          style={[styles.input, styles.textArea]}
          multiline
        />
      </View>
      <View style={styles.actions}>
        <Button
          title="Cancel"
          variant="secondary"
          onPress={onCancel}
          style={styles.halfButton}
        />
        <Button
          title="Submit Request"
          onPress={onSubmit}
          style={styles.halfButton}
        />
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radii.xl,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  field: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  label: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: colors.subduedText,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: scaleFont(16),
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  halfButton: {
    flex: 1,
  },
});
