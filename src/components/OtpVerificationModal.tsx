import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, radii, spacing } from '../theme';
import { scaleFont } from '../theme/scale';

type Props = {
  visible: boolean;
  title: string;
  subtitle: string;
  identifier: string; // email or phone number
  onClose: () => void;
  onVerify: (code: string) => void;
  onResend: () => void;
  isVerifying?: boolean;
  isResending?: boolean;
  error?: string | null;
};

const OTP_LENGTH = 6;

export function OtpVerificationModal({
  visible,
  title,
  subtitle,
  identifier,
  onClose,
  onVerify,
  onResend,
  isVerifying = false,
  isResending = false,
  error,
}: Props) {
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Reset OTP when modal closes
  useEffect(() => {
    if (!visible) {
      setOtp(Array(OTP_LENGTH).fill(''));
    }
  }, [visible]);

  // Focus first input when modal opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [visible]);

  const handleChange = (text: string, index: number) => {
    // Only allow digits
    const digit = text.replace(/[^0-9]/g, '').slice(-1);

    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Move to next input if digit entered
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    if (digit && index === OTP_LENGTH - 1) {
      const fullOtp = newOtp.join('');
      if (fullOtp.length === OTP_LENGTH) {
        Keyboard.dismiss();
        onVerify(fullOtp);
      }
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // Move to previous input and clear it
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    if (digits.length > 0) {
      const newOtp = [...otp];
      for (let i = 0; i < digits.length; i++) {
        newOtp[i] = digits[i];
      }
      setOtp(newOtp);

      if (digits.length === OTP_LENGTH) {
        Keyboard.dismiss();
        onVerify(digits);
      } else {
        inputRefs.current[digits.length]?.focus();
      }
    }
  };

  const handleSubmit = () => {
    const fullOtp = otp.join('');
    if (fullOtp.length === OTP_LENGTH) {
      onVerify(fullOtp);
    }
  };

  const isComplete = otp.every((digit) => digit !== '');
  const isDisabled = !isComplete || isVerifying;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Icon name="shield" size={28} color={colors.primary} />
            </View>
            <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
              <Icon name="x" size={20} color={colors.subduedText} />
            </Pressable>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={styles.identifier}>{identifier}</Text>

          <View style={styles.otpContainer}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[
                  styles.otpInput,
                  digit && styles.otpInputFilled,
                  error && styles.otpInputError,
                ]}
                value={digit}
                onChangeText={(text) => handleChange(text, index)}
                onKeyPress={({ nativeEvent }) =>
                  handleKeyPress(nativeEvent.key, index)
                }
                onChange={(e) => {
                  // Handle paste
                  const text = e.nativeEvent.text;
                  if (text.length > 1) {
                    handlePaste(text);
                  }
                }}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                editable={!isVerifying}
              />
            ))}
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Icon name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.verifyButton, isDisabled && styles.verifyButtonDisabled]}
            onPress={handleSubmit}
            disabled={isDisabled}
          >
            {isVerifying ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.surface} />
                <Text style={styles.verifyButtonText}>Verifying...</Text>
              </View>
            ) : (
              <Text style={styles.verifyButtonText}>Verify</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.resendRow}
            onPress={onResend}
            disabled={isResending}
          >
            {isResending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Text style={styles.resendText}>Didn&apos;t receive the code?</Text>
                <Text style={styles.resendLink}>Resend</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 360,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: spacing.xs,
  },
  title: {
    fontSize: scaleFont(20),
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  identifier: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  otpInput: {
    width: 44,
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    fontSize: scaleFont(20),
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    backgroundColor: colors.background,
  },
  otpInputFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  otpInputError: {
    borderColor: colors.error,
    backgroundColor: colors.errorSurface,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: scaleFont(13),
    color: colors.error,
    fontWeight: '500',
  },
  verifyButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonDisabled: {
    backgroundColor: colors.border,
  },
  verifyButtonText: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: colors.surface,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  resendText: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
  },
  resendLink: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: colors.primary,
  },
});
