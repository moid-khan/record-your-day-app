import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StepFooter } from '../components/stepper/StepFooter';
import { StepHeader } from '../components/stepper/StepHeader';
import { colors, radii, spacing, typography } from '../theme';
import { scaleFont } from '../theme/scale';
import { useResetPassword, getErrorMessage, getFieldError } from '../hooks/useAuth';

type ResetPasswordScreenProps = {
  token: string;
  onSuccess: () => void;
  onBack: () => void;
};

export function ResetPasswordScreen({ token, onSuccess, onBack }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const { mutate: resetPassword, isPending, error, reset } = useResetPassword();

  const passwordsMatch = password === confirm;
  const isValidLength = password.length >= 6;

  const isDisabled = useMemo(
    () => !password || !isValidLength || !passwordsMatch || isPending,
    [password, isValidLength, passwordsMatch, isPending],
  );

  const handleSubmit = () => {
    if (isDisabled) return;
    reset();
    resetPassword(
      { token, password },
      {
        onSuccess: () => {
          onSuccess();
        },
      },
    );
  };

  const passwordError = getFieldError(error, 'password');
  const tokenError = getFieldError(error, 'token');
  const generalError = error && !passwordError && !tokenError ? getErrorMessage(error) : null;

  // Validation feedback
  const getValidationMessage = () => {
    if (!password) return null;
    if (!isValidLength) return 'Password must be at least 6 characters';
    if (confirm && !passwordsMatch) return 'Passwords do not match';
    return null;
  };

  const validationMessage = getValidationMessage();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StepHeader
        title="Set New Password"
        step={0}
        totalSteps={1}
        showStepper={false}
      />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={24}
      >
        <View style={styles.iconHeader}>
          <View style={styles.iconCircle}>
            <Icon name="lock" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Create a new password</Text>
          <Text style={styles.subtitle}>Enter and confirm your new password</Text>
        </View>

        {(generalError || tokenError) && (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorBannerText}>{tokenError || generalError}</Text>
          </View>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>New Password</Text>
          <View style={[styles.inputContainer, passwordError && styles.inputError]}>
            <Icon name="lock" size={18} color={passwordError ? colors.error : colors.subduedText} />
            <TextInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (error) reset();
              }}
              placeholder="••••••••"
              placeholderTextColor={colors.subduedText}
              secureTextEntry
              style={styles.input}
              editable={!isPending}
            />
          </View>
          {passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}

          <Text style={[styles.label, styles.fieldSpacing]}>Confirm Password</Text>
          <View style={[styles.inputContainer, (validationMessage && confirm) && styles.inputError]}>
            <Icon
              name="lock"
              size={18}
              color={(validationMessage && confirm) ? colors.error : colors.subduedText}
            />
            <TextInput
              value={confirm}
              onChangeText={(text) => {
                setConfirm(text);
                if (error) reset();
              }}
              placeholder="••••••••"
              placeholderTextColor={colors.subduedText}
              secureTextEntry
              style={styles.input}
              editable={!isPending}
            />
          </View>
          {validationMessage && (
            <Text style={styles.fieldError}>{validationMessage}</Text>
          )}
        </View>
      </KeyboardAvoidingView>

      <StepFooter
        isLast
        primaryLabel={isPending ? undefined : 'Update Password'}
        primaryContent={
          isPending ? (
            <View style={styles.loadingButton}>
              <ActivityIndicator size="small" color={colors.surface} />
              <Text style={styles.loadingText}>Updating...</Text>
            </View>
          ) : undefined
        }
        disablePrimary={isDisabled}
        onPrimary={handleSubmit}
        onBack={onBack}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  iconHeader: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: scaleFont(20),
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorSurface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: scaleFont(14),
    color: colors.error,
    fontWeight: '500',
  },
  form: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  label: {
    ...typography.subtitle,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  inputError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  fieldError: {
    fontSize: scaleFont(12),
    color: colors.error,
    marginTop: spacing.xs,
  },
  fieldSpacing: {
    marginTop: spacing.md,
  },
  loadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.surface,
    fontSize: scaleFont(16),
    fontWeight: '600',
  },
});
