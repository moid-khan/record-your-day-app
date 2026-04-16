import React from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
  View,
} from 'react-native';
import { colors, radii, spacing } from '../theme';
import { scaleFont } from '../theme/scale';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  title?: string;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  children?: React.ReactNode;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  style,
  textStyle,
  disabled = false,
  leftIcon,
  children,
}: ButtonProps) {
  const variantStyle =
    variant === 'primary'
      ? styles.primary
      : variant === 'secondary'
        ? styles.secondary
        : styles.ghost;

  const textColor =
    variant === 'primary' ? colors.surface : colors.text;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        variantStyle,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      onPress={disabled ? undefined : onPress}
    >
      <View style={styles.content}>
        {children ? (
          children
        ) : (
          <>
            {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
            <Text style={[styles.label, { color: textColor }, textStyle]}>
              {title}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  label: {
    fontSize: scaleFont(16),
    fontWeight: '600',
  },
});
