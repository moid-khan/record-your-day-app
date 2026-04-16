import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { StepFooter } from '../components/stepper/StepFooter';
import { StepHeader } from '../components/stepper/StepHeader';
import { colors, radii, spacing, typography } from '../theme';
import { scaleFont } from '../theme/scale';
import { useLogin, getErrorMessage, getFieldError } from '../hooks/useAuth';

type SignInScreenProps = {
  onCreateAccount?: () => void;
  onForgotPassword?: () => void;
};

export function SignInScreen({
  onCreateAccount,
  onForgotPassword,
}: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { mutate: login, isPending, error, reset } = useLogin();
  console.log('🚀 ~ SignInScreen ~ error:', error);

  const isDisabled = useMemo(
    () => !email.trim() || !password || isPending,
    [email, password, isPending],
  );

  const handleSignIn = () => {
    if (isDisabled) return;
    reset(); // Clear previous errors
    login({ email: email.trim().toLowerCase(), password });
  };

  const emailError = getFieldError(error, 'email');
  const passwordError = getFieldError(error, 'password');
  const generalError =
    error && !emailError && !passwordError ? getErrorMessage(error) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StepHeader
        title="Record Your Day"
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
            <Icon name="log-in" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue recording</Text>
        </View>

        {generalError && (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorBannerText}>{generalError}</Text>
          </View>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <View
            style={[styles.inputContainer, emailError && styles.inputError]}
          >
            <Icon
              name="mail"
              size={18}
              color={emailError ? colors.error : colors.subduedText}
            />
            <TextInput
              value={email}
              onChangeText={text => {
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

          <Text style={[styles.label, styles.fieldSpacing]}>Password</Text>
          <View
            style={[styles.inputContainer, passwordError && styles.inputError]}
          >
            <Icon
              name="lock"
              size={18}
              color={passwordError ? colors.error : colors.subduedText}
            />
            <TextInput
              value={password}
              onChangeText={text => {
                setPassword(text);
                if (error) reset();
              }}
              placeholder="••••••••"
              placeholderTextColor={colors.subduedText}
              secureTextEntry
              style={styles.input}
              editable={!isPending}
              returnKeyType="done"
            />
          </View>
          {passwordError && (
            <Text style={styles.fieldError}>{passwordError}</Text>
          )}

          <Pressable
            style={styles.linkRow}
            onPress={onForgotPassword}
            disabled={isPending}
          >
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>

          <Pressable
            style={styles.createRow}
            onPress={onCreateAccount}
            disabled={isPending}
          >
            <Text style={styles.createText}>
              Don&apos;t have an account?{' '}
              <Text style={styles.createLink}>Create one</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <StepFooter
        isLast
        primaryLabel={isPending ? undefined : 'Sign In'}
        primaryContent={
          isPending ? (
            <View style={styles.loadingButton}>
              <ActivityIndicator size="small" color={colors.surface} />
              <Text style={styles.loadingText}>Signing in...</Text>
            </View>
          ) : undefined
        }
        disablePrimary={isDisabled}
        onPrimary={handleSignIn}
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
  linkRow: {
    marginTop: spacing.sm,
    alignItems: 'flex-end',
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: scaleFont(14),
  },
  createRow: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  createText: {
    color: colors.subduedText,
    fontSize: scaleFont(14),
  },
  createLink: {
    color: colors.primary,
    fontWeight: '700',
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
