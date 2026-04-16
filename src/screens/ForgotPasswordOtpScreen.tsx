import React, { useMemo, useState } from 'react';
import {
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

type ForgotPasswordOtpScreenProps = {
  email: string;
  onVerify: (token: string) => void;
  onBack: () => void;
  onResend: () => void;
};

export function ForgotPasswordOtpScreen({
  email,
  onVerify,
  onBack,
  onResend,
}: ForgotPasswordOtpScreenProps) {
  const [code, setCode] = useState('');

  const isDisabled = useMemo(() => code.length < 6, [code]);

  const handleVerify = () => {
    if (isDisabled) return;
    onVerify(code.trim());
  };

  // Mask email for display (e.g., "j***@example.com")
  const maskedEmail = useMemo(() => {
    const [localPart, domain] = email.split('@');
    if (!domain) return email;
    const maskedLocal = localPart.charAt(0) + '***';
    return `${maskedLocal}@${domain}`;
  }, [email]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StepHeader
        title="Enter Code"
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
            <Icon name="key" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a reset code to {maskedEmail}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Reset Code</Text>
          <View style={styles.inputContainer}>
            <Icon name="lock" size={18} color={colors.subduedText} />
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Enter 6-digit code"
              placeholderTextColor={colors.subduedText}
              keyboardType="default"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              style={styles.input}
            />
          </View>
          <Text style={styles.hint}>
            Enter the code from the email we sent you
          </Text>

          <View style={styles.linkContainer}>
            <Pressable style={styles.linkRow} onPress={onResend}>
              <Text style={styles.link}>Resend code</Text>
            </Pressable>
            <Pressable style={styles.linkRow} onPress={onBack}>
              <Text style={styles.link}>Change email</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <StepFooter
        isLast
        primaryLabel="Continue"
        disablePrimary={isDisabled}
        onPrimary={handleVerify}
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
  input: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: colors.text,
    paddingVertical: spacing.sm,
    letterSpacing: 2,
  },
  hint: {
    fontSize: scaleFont(13),
    color: colors.subduedText,
    marginTop: spacing.xs,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  linkRow: {
    alignItems: 'flex-start',
  },
  link: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: scaleFont(14),
  },
});
