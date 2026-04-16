import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { useForgotPassword, getErrorMessage, getFieldError } from '../hooks/useAuth';

type ForgotPasswordScreenProps = {
  onNext: (email: string) => void;
  onBack: () => void;
};

export function ForgotPasswordScreen({ onNext, onBack }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');

  const { mutate: forgotPassword, isPending, error, reset } = useForgotPassword();

  const isDisabled = useMemo(() => !email.trim() || isPending, [email, isPending]);

  const handleSendCode = () => {
    if (isDisabled) return;
    reset();
    forgotPassword(
      { email: email.trim().toLowerCase() },
      {
        onSuccess: () => {
          onNext(email.trim().toLowerCase());
        },
      },
    );
  };

  const emailError = getFieldError(error, 'email');
  const generalError = error && !emailError ? getErrorMessage(error) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StepHeader
        title="Forgot Password"
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
            <Icon name="mail" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>Enter your email and we&apos;ll send you a code</Text>
        </View>

        {generalError && (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorBannerText}>{generalError}</Text>
          </View>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <View style={[styles.inputContainer, emailError && styles.inputError]}>
            <Icon name="mail" size={18} color={emailError ? colors.error : colors.subduedText} />
            <TextInput
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (error) reset();
              }}
              placeholder="you@example.com"
              placeholderTextColor={colors.subduedText}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              editable={!isPending}
            />
          </View>
          {emailError && <Text style={styles.fieldError}>{emailError}</Text>}

          <Pressable style={styles.linkRow} onPress={onBack} disabled={isPending}>
            <Text style={styles.link}>Back to Sign In</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <StepFooter
        isLast
        primaryLabel={isPending ? undefined : 'Send Code'}
        primaryContent={
          isPending ? (
            <View style={styles.loadingButton}>
              <ActivityIndicator size="small" color={colors.surface} />
              <Text style={styles.loadingText}>Sending...</Text>
            </View>
          ) : undefined
        }
        disablePrimary={isDisabled}
        onPrimary={handleSendCode}
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
  linkRow: {
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  link: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: scaleFont(14),
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
