import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type Props = {
  label: string;
  icon: string;
  value: string;
  editable: boolean;
  placeholder?: string;
  keyboardType?: 'email-address' | 'phone-pad' | 'default';
  onChangeText: (text: string) => void;
  onPress?: () => void;
};

export function ProfileField({
  label,
  icon,
  value,
  editable,
  placeholder,
  keyboardType,
  onChangeText,
  onPress,
}: Props) {
  const inputProps = {
    value,
    onChangeText,
    editable: onPress ? false : editable,
    placeholder,
    placeholderTextColor: colors.subduedText,
    keyboardType,
    style: styles.input,
  };

  const Container = onPress ? Pressable : View;

  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Container
        style={[styles.inputRow, (!editable || onPress) && styles.inputDisabled]}
        onPress={onPress}
        disabled={!onPress}
      >
        <Icon name={icon} size={18} color={colors.subduedText} />
        <TextInput
          {...inputProps}
          pointerEvents={onPress ? 'none' : 'auto'}
        />
        {onPress ? <Icon name="chevron-down" size={18} color={colors.subduedText} /> : null}
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldBlock: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  input: {
    marginLeft: spacing.sm,
    flex: 1,
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: colors.text,
    paddingVertical: 0,
  },
});
