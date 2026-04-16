import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { OtpVerificationModal } from '../components/OtpVerificationModal';
import { colors, radii, spacing } from '../theme';
import { scaleFont } from '../theme/scale';
import { api, ApiException, fetchCsrfToken } from '../lib/api';
import { useSendOtp, useVerifyOtp } from '../hooks/useOnboarding';
import { useAuthStore } from '../state/useAuthStore';
import type { GetMeResponse } from '../types/auth';

type FormValues = {
  email: string;
  password: string;
};

export function SignupStepperScreen() {
  const navigation = useNavigation();
  const setAuth = useAuthStore(s => s.setAuth);
  const [values, setValues] = useState<FormValues>({
    email: '',
    password: '',
  });

  // OTP states
  const [showEmailOtp, setShowEmailOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitStep, setSubmitStep] = useState<'idle' | 'otp' | 'signup'>(
    'idle',
  );

  // Hooks for OTP
  const sendOtpMutation = useSendOtp();
  const verifyOtpMutation = useVerifyOtp();

  const clearError = () => {
    setSubmitError(null);
    setOtpError(null);
  };

  // Handle Send Email OTP
  const handleSendEmailOtp = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitStep('otp');

    try {
      await sendOtpMutation.mutateAsync({
        identifier: values.email.trim().toLowerCase(),
        type: 'email',
      });
      setShowEmailOtp(true);
    } catch (error) {
      const message =
        error instanceof ApiException
          ? error.message
          : 'Failed to send verification code. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
      setSubmitStep('idle');
    }
  };

  // Handle Verify Email OTP
  const handleVerifyEmailOtp = async (code: string) => {
    setOtpError(null);

    try {
      const response = await verifyOtpMutation.mutateAsync({
        identifier: values.email.trim().toLowerCase(),
        code,
        type: 'email',
      });

      if (response.signupToken) {
        setShowEmailOtp(false);
        // Now create the account with signupToken
        await handleSignup(response.signupToken);
      } else {
        setOtpError('Invalid response from server. Please try again.');
      }
    } catch (error) {
      const message =
        error instanceof ApiException
          ? error.message
          : 'Invalid verification code. Please try again.';
      setOtpError(message);
    }
  };

  // Handle Signup after email verification
  const handleSignup = async (signupToken: string) => {
    setIsSubmitting(true);
    setSubmitStep('signup');

    try {
      // Create the account
      await api.post('/auth/signup', {
        email: values.email.trim().toLowerCase(),
        password: values.password,
        isActor: true,
        signupToken,
      });

      // Account created - now auto-login to continue to profile completion
      setSubmitStep('idle');
      await handleAutoLogin();
    } catch (error) {
      console.log('🚀 ~ handleSignup ~ error:', error);
      const message =
        error instanceof ApiException
          ? error.message
          : 'Failed to create account. Please try again.';
      setSubmitError(message);
      setIsSubmitting(false);
      setSubmitStep('idle');
    }
  };

  // Auto-login after successful signup using NextAuth credentials
  const handleAutoLogin = async () => {
    setSubmitStep('signup');

    try {
      // Step 1: Fetch CSRF token
      const csrfToken = await fetchCsrfToken();
      console.log('🚀 ~ handleAutoLogin ~ csrfToken:', csrfToken);
      if (!csrfToken) {
        throw new ApiException({
          message: 'Failed to get CSRF token',
          statusCode: 500,
        });
      }

      // Step 2: Call NextAuth credentials callback
      const callbackResponse = await fetch(
        'https://dev.recordyourday.com/api/auth/callback/credentials',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          credentials: 'include',
          body: new URLSearchParams({
            email: values.email.trim().toLowerCase(),
            password: values.password,
            csrfToken,
            redirect: 'false',
            json: 'true',
          }).toString(),
        },
      );
      console.log('🚀 ~ handleAutoLogin ~ callbackResponse status:', callbackResponse.status);

      // NextAuth returns 200 even for failed auth, check the response body
      const callbackData = await callbackResponse.json().catch(() => ({}));
      console.log('🚀 ~ handleAutoLogin ~ callbackData:', callbackData);

      // NextAuth returns { url, ok, error } format with redirect: false
      if (callbackData.error) {
        throw new ApiException({
          message: callbackData.error === 'CredentialsSignin' ? 'Invalid credentials' : callbackData.error,
          statusCode: 401,
        });
      }

      // Step 3: Fetch session to verify login
      const sessionResponse = await fetch(
        'https://dev.recordyourday.com/api/auth/session',
        {
          method: 'GET',
          credentials: 'include',
        },
      );
      console.log('🚀 ~ handleAutoLogin ~ sessionResponse status:', sessionResponse.status);

      const session = await sessionResponse.json();
      console.log('🚀 ~ handleAutoLogin ~ session:', session);

      if (!session.user) {
        throw new ApiException({
          message: 'Session not established. Please sign in manually.',
          statusCode: 401,
        });
      }

      // Step 4: Get full user details from /user/me
      const meResponse = await api.get<{ user: GetMeResponse['data']['user'] }>('/user/me', true);
      console.log('🚀 ~ handleAutoLogin ~ meResponse:', meResponse);

      // Set auth state - this will navigate to ProfileCompletion since phone is null
      setAuth(meResponse.user, csrfToken);
    } catch (error) {
      console.log('🚀 ~ handleAutoLogin ~ error:', error);
      const message =
        error instanceof ApiException
          ? error.message
          : 'Account created but login failed. Please sign in manually.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
      setSubmitStep('idle');
    }
  };

  const handleSubmit = async () => {
    await handleSendEmailOtp();
  };

  const isButtonDisabled = useMemo(() => {
    if (isSubmitting) return true;
    const emailValid = values.email.trim().includes('@');
    const passwordValid = values.password.length >= 8;
    return !emailValid || !passwordValid;
  }, [values, isSubmitting]);

  const getLoadingText = () => {
    if (submitStep === 'otp') return 'Sending code...';
    if (submitStep === 'signup') return 'Creating account...';
    return 'Please wait...';
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Icon name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Create Account</Text>
        <View style={styles.headerSpacer} />
      </View>

      {submitError && (
        <View style={styles.errorBanner}>
          <Icon name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorBannerText}>{submitError}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {/* Icon and Title */}
            <View style={styles.iconHeader}>
              <View style={styles.iconCircle}>
                <Icon name="user-plus" size={32} color={colors.primary} />
              </View>
              <Text style={styles.title}>Join Record Your Day</Text>
              <Text style={styles.subtitle}>
                Enter your email and password to get started
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <View>
                <Text style={styles.fieldLabel}>Email</Text>
                <View style={styles.inputContainer}>
                  <Icon name="mail" size={18} color={colors.subduedText} />
                  <TextInput
                    value={values.email}
                    onChangeText={text => {
                      setValues(prev => ({ ...prev, email: text }));
                      if (submitError) clearError();
                    }}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.subduedText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                    editable={!isSubmitting}
                  />
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>Password</Text>
                <View style={styles.inputContainer}>
                  <Icon name="lock" size={18} color={colors.subduedText} />
                  <TextInput
                    value={values.password}
                    onChangeText={text => {
                      setValues(prev => ({ ...prev, password: text }));
                      if (submitError) clearError();
                    }}
                    placeholder="Create a password"
                    placeholderTextColor={colors.subduedText}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                    editable={!isSubmitting}
                  />
                </View>
                <Text style={styles.hint}>Minimum 8 characters</Text>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={[
            styles.button,
            isButtonDisabled && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isButtonDisabled}
        >
          {isSubmitting ? (
            <View style={styles.loadingButton}>
              <ActivityIndicator size="small" color={colors.surface} />
              <Text style={styles.buttonText}>{getLoadingText()}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </Pressable>
      </View>

      {/* Email OTP Modal */}
      <OtpVerificationModal
        visible={showEmailOtp}
        title="Verify Your Email"
        subtitle="Enter the 6-digit code sent to"
        identifier={values.email}
        onClose={() => {
          setShowEmailOtp(false);
          setOtpError(null);
        }}
        onVerify={handleVerifyEmailOtp}
        onResend={handleSendEmailOtp}
        isVerifying={verifyOtpMutation.isPending}
        isResending={sendOtpMutation.isPending}
        error={otpError}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  iconHeader: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    backgroundColor: colors.primarySurface,
  },
  title: {
    fontSize: scaleFont(22),
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
    textAlign: 'center',
  },
  form: {
    gap: spacing.lg,
  },
  fieldLabel: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
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
  input: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  hint: {
    fontSize: scaleFont(12),
    color: colors.subduedText,
    marginTop: spacing.xs,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorSurface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
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
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md + spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.surface,
    fontSize: scaleFont(16),
    fontWeight: '600',
  },
  loadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
