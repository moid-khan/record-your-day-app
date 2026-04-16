import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutDown,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { StepFooter } from '../components/stepper/StepFooter';
import { StepHeader } from '../components/stepper/StepHeader';
import { OtpVerificationModal } from '../components/OtpVerificationModal';
import { colors, radii, spacing, typography } from '../theme';
import { scaleFont } from '../theme/scale';
import { api, ApiException } from '../lib/api';
import { useAuthStore } from '../state/useAuthStore';
import { useSendOtp, useVerifyOtp } from '../hooks/useOnboarding';

type StepValues = {
  phone: string;
  height: string;
  fullTimeJob: string;
  dominantHand: 'left' | 'right' | '';
};

type SelectorOption = {
  label: string;
  value: string;
};

const heightOptions: SelectorOption[] = [
  { label: 'Under 150 cm (4\'11")', value: '145' },
  { label: '150-160 cm (4\'11"-5\'3")', value: '155' },
  { label: '161-170 cm (5\'3"-5\'7")', value: '165' },
  { label: '171-180 cm (5\'7"-5\'11")', value: '175' },
  { label: '181-190 cm (5\'11"-6\'3")', value: '185' },
  { label: 'Over 190 cm (6\'3"+)', value: '195' },
];

const handednessOptions: SelectorOption[] = [
  { label: 'Left Hand', value: 'left' },
  { label: 'Right Hand', value: 'right' },
];

const STEP_COUNT = 2;
const FINAL_STEP = STEP_COUNT - 1;

export function ProfileCompletionScreen() {
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [activeSelector, setActiveSelector] = useState<
    null | 'height' | 'dominantHand'
  >(null);
  const [values, setValues] = useState<StepValues>({
    phone: '',
    height: '',
    fullTimeJob: '',
    dominantHand: '',
  });

  // OTP states
  const [showPhoneOtp, setShowPhoneOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitStep, setSubmitStep] = useState<'idle' | 'otp' | 'profile'>(
    'idle',
  );

  // Hooks for Phone OTP (uses /auth/send-otp and /auth/verify-otp with type: 'phone')
  const sendOtpMutation = useSendOtp();
  const verifyOtpMutation = useVerifyOtp();

  const stepProgress = useSharedValue(0);
  const iconPulse = useSharedValue(1);

  useEffect(() => {
    stepProgress.value = withTiming(step, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [step, stepProgress]);

  useEffect(() => {
    if (step >= 1) {
      iconPulse.value = withSequence(
        withDelay(
          120,
          withSpring(1.08, {
            damping: 8,
            stiffness: 160,
          }),
        ),
        withTiming(1, { duration: 200 }),
      );
    } else {
      iconPulse.value = 1;
    }
  }, [step, iconPulse]);

  const translateStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -stepProgress.value * width }],
  }));

  const clearError = () => {
    setSubmitError(null);
    setOtpError(null);
  };

  // Step 0: Phone number verification
  // Step 1: Profile details (Height, Job, Handedness)

  const steps = useMemo(
    () => [
      {
        title: 'Verify Phone',
        subtitle: 'We need to verify your phone number',
        icon: 'smartphone',
        render: () => (
          <View style={styles.formStack}>
            <View>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <View style={styles.inputContainer}>
                <Icon name="phone" size={18} color={colors.subduedText} />
                <TextInput
                  value={values.phone}
                  onChangeText={text => {
                    setValues(prev => ({ ...prev, phone: text }));
                    if (submitError) clearError();
                    setPhoneVerified(false);
                  }}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor={colors.subduedText}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  editable={!isSubmitting && !phoneVerified}
                />
                {phoneVerified && (
                  <Icon name="check-circle" size={20} color={colors.success} />
                )}
              </View>
              <Text style={styles.hint}>
                Include country code (e.g., +1 for US)
              </Text>
            </View>
            {phoneVerified && (
              <View style={styles.successBanner}>
                <Icon name="check-circle" size={16} color={colors.success} />
                <Text style={styles.successText}>Phone verified successfully!</Text>
              </View>
            )}
          </View>
        ),
      },
      {
        title: 'Your Profile',
        subtitle: 'Tell us a bit about yourself',
        icon: 'user',
        render: () => (
          <View style={styles.formStack}>
            <Selector
              label="Height"
              icon="maximize-2"
              value={
                values.height
                  ? heightOptions.find(o => o.value === values.height)?.label ||
                    values.height
                  : ''
              }
              placeholder="Select your height"
              onPress={() => setActiveSelector('height')}
            />
            <View>
              <Text style={styles.fieldLabel}>Full Time Job (optional)</Text>
              <View style={styles.inputContainer}>
                <Icon name="briefcase" size={18} color={colors.subduedText} />
                <TextInput
                  value={values.fullTimeJob}
                  onChangeText={text =>
                    setValues(prev => ({ ...prev, fullTimeJob: text }))
                  }
                  placeholder="e.g., Software Engineer"
                  placeholderTextColor={colors.subduedText}
                  autoCapitalize="words"
                  autoCorrect={false}
                  style={styles.input}
                  editable={!isSubmitting}
                />
              </View>
            </View>
            <Selector
              label="Dominant Hand"
              icon="hand"
              value={
                values.dominantHand
                  ? handednessOptions.find(o => o.value === values.dominantHand)
                      ?.label || ''
                  : ''
              }
              placeholder="Select your dominant hand"
              onPress={() => setActiveSelector('dominantHand')}
            />
          </View>
        ),
      },
    ],
    [values, submitError, isSubmitting, phoneVerified],
  );

  // Handle Send Phone OTP
  const handleSendPhoneOtp = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitStep('otp');

    try {
      await sendOtpMutation.mutateAsync({
        identifier: values.phone.trim(),
        type: 'phone',
      });
      setShowPhoneOtp(true);
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

  // Handle Verify Phone OTP
  const handleVerifyPhoneOtp = async (code: string) => {
    setOtpError(null);

    try {
      await verifyOtpMutation.mutateAsync({
        identifier: values.phone.trim(),
        code,
        type: 'phone',
      });

      setShowPhoneOtp(false);
      setPhoneVerified(true);
      // Move to profile step
      setStep(1);
    } catch (error) {
      const message =
        error instanceof ApiException
          ? error.message
          : 'Invalid verification code. Please try again.';
      setOtpError(message);
    }
  };

  // Handle Save Profile (final step)
  const handleSaveProfile = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitStep('profile');

    try {
      // Call PATCH /api/user to update user profile with actorStatus: PENDING
      const response = await api.patch<{ success?: boolean; user?: any; message?: string }>('/user', {
        phone: values.phone.trim(),
        height: values.height ? parseInt(values.height, 10) : undefined,
        dominantHand: values.dominantHand || undefined,
        fullTimeJob: values.fullTimeJob || undefined,
        actorStatus: 'PENDING', // Set actor status to pending for approval
      }, true);
      console.log('🚀 ~ handleSaveProfile ~ response:', response);

      // Update user in store with new data
      if (user) {
        const updatedUser = {
          ...user,
          phone: values.phone.trim(),
          actorStatus: 'PENDING' as const,
        };
        setUser(updatedUser);
      }

      // Profile saved - navigation will happen automatically via auth state (to pending screen)
    } catch (error) {
      console.log('🚀 ~ handleSaveProfile ~ error:', error);
      const message =
        error instanceof ApiException
          ? error.message
          : 'Failed to save profile. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
      setSubmitStep('idle');
    }
  };

  const handleContinue = async () => {
    if (step === 0) {
      if (phoneVerified) {
        // Already verified, move to next step
        setStep(1);
      } else {
        // Send phone OTP
        await handleSendPhoneOtp();
      }
    } else if (step === FINAL_STEP) {
      // Save profile
      await handleSaveProfile();
    }
  };

  const handleBack = () => {
    if (step <= 0) return;
    setStep(prev => prev - 1);
    if (submitError) clearError();
  };

  const handleOptionSelect = (optionValue: string) => {
    if (!activeSelector) return;
    setValues(prev => ({ ...prev, [activeSelector]: optionValue }));
    setActiveSelector(null);
  };

  const selectorConfig =
    activeSelector === 'height'
      ? {
          title: 'Select height',
          options: heightOptions,
          selectedValue: values.height,
        }
      : activeSelector === 'dominantHand'
      ? {
          title: 'Select dominant hand',
          options: handednessOptions,
          selectedValue: values.dominantHand,
        }
      : null;

  const isContinueDisabled = useMemo(() => {
    if (isSubmitting) return true;
    if (step === 0) {
      return !values.phone.trim();
    }
    if (step === 1) {
      // Height and handedness are required
      return !values.height || !values.dominantHand;
    }
    return false;
  }, [step, values, isSubmitting]);

  const getLoadingText = () => {
    if (submitStep === 'otp') return 'Sending code...';
    if (submitStep === 'profile') return 'Saving profile...';
    return 'Please wait...';
  };

  const getPrimaryLabel = () => {
    if (step === 0) {
      return phoneVerified ? 'Continue' : 'Verify Phone';
    }
    if (step === 1) return 'Complete Setup';
    return 'Continue';
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StepHeader
        title="Complete Your Profile"
        step={step}
        totalSteps={STEP_COUNT}
        progress={stepProgress}
      />

      {submitError && (
        <View style={styles.errorBanner}>
          <Icon name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorBannerText}>{submitError}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.stepsWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View
            style={[
              styles.stepsRow,
              { width: width * STEP_COUNT },
              translateStyle,
            ]}
          >
            {steps.map((stepItem, idx) => (
              <StepPane
                key={stepItem.title}
                index={idx}
                width={width}
                progress={stepProgress}
              >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.stepScroll}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                >
                  <View style={styles.iconHeader}>
                    <AnimatedIconCircle
                      name={stepItem.icon}
                      color={colors.primary}
                      background={colors.primarySurface}
                      scale={iconPulse}
                    />
                    <Text style={styles.sectionTitle}>{stepItem.title}</Text>
                    <Text style={styles.sectionSubtitle}>
                      {stepItem.subtitle}
                    </Text>
                  </View>
                  <Animated.View
                    entering={FadeInUp.duration(260)}
                    exiting={FadeOutDown.duration(180)}
                  >
                    {stepItem.render()}
                  </Animated.View>
                </ScrollView>
              </StepPane>
            ))}
          </Animated.View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <StepFooter
        isLast={step === FINAL_STEP}
        primaryLabel={isSubmitting ? undefined : getPrimaryLabel()}
        primaryContent={
          isSubmitting ? (
            <View style={styles.loadingButton}>
              <ActivityIndicator size="small" color={colors.surface} />
              <Text style={styles.loadingText}>{getLoadingText()}</Text>
            </View>
          ) : undefined
        }
        disablePrimary={isContinueDisabled}
        onPrimary={handleContinue}
        onBack={step > 0 && !isSubmitting ? handleBack : undefined}
      />

      <OptionSheet
        visible={!!selectorConfig}
        title={selectorConfig?.title ?? ''}
        options={selectorConfig?.options ?? []}
        selectedValue={selectorConfig?.selectedValue ?? ''}
        onClose={() => setActiveSelector(null)}
        onSelect={handleOptionSelect}
      />

      {/* Phone OTP Modal */}
      <OtpVerificationModal
        visible={showPhoneOtp}
        title="Verify Your Phone"
        subtitle="Enter the 6-digit code sent to"
        identifier={values.phone}
        onClose={() => {
          setShowPhoneOtp(false);
          setOtpError(null);
        }}
        onVerify={handleVerifyPhoneOtp}
        onResend={handleSendPhoneOtp}
        isVerifying={verifyOtpMutation.isPending}
        isResending={sendOtpMutation.isPending}
        error={otpError}
      />
    </SafeAreaView>
  );
}

function Selector({
  label,
  icon,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  icon: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
}) {
  const displayValue = value || placeholder || '';
  const isPlaceholder = !value;

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        style={[styles.inputContainer, styles.selectorContainer]}
        onPress={onPress}
      >
        <View style={styles.selectorContent}>
          <Icon name={icon} size={18} color={colors.subduedText} />
          <Text
            style={[
              styles.selectorValue,
              isPlaceholder && styles.selectorPlaceholder,
            ]}
          >
            {displayValue}
          </Text>
        </View>
        <Icon name="chevron-down" size={18} color={colors.subduedText} />
      </Pressable>
    </View>
  );
}

function StepPane({
  index,
  width,
  progress,
  children,
}: {
  index: number;
  width: number;
  progress: SharedValue<number>;
  children: React.ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const dist = Math.abs(progress.value - index);
    const opacity = 1 - Math.min(dist, 1) * 0.25;
    const translateY = Math.min(dist, 1) * 12;
    return {
      opacity,
      transform: [
        { translateY: progress.value > index ? translateY : -translateY },
      ],
    };
  });

  return (
    <Animated.View style={[styles.stepPane, { width }, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

function OptionSheet({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: SelectorOption[];
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Icon name="x" size={18} color={colors.subduedText} />
            </Pressable>
          </View>
          <ScrollView>
            {options.map(option => (
              <Pressable
                key={option.value || option.label}
                onPress={() => onSelect(option.value)}
                style={[
                  styles.sheetOption,
                  selectedValue === option.value && styles.sheetOptionSelected,
                ]}
              >
                <Text style={styles.sheetOptionLabel}>{option.label}</Text>
                {selectedValue === option.value ? (
                  <Icon name="check" size={18} color={colors.primary} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AnimatedIconCircle({
  name,
  color,
  background,
  scale,
}: {
  name: string;
  color: string;
  background: string;
  scale: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      style={[
        styles.iconCircle,
        { backgroundColor: background },
        animatedStyle,
      ]}
    >
      <Icon name={name} size={32} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stepsRow: {
    flexDirection: 'row',
  },
  stepsWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  stepPane: {},
  stepScroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
  },
  iconHeader: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
    textAlign: 'center',
  },
  formStack: {
    gap: spacing.lg,
  },
  fieldLabel: {
    ...typography.subtitle,
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
  selectorContainer: {
    justifyContent: 'space-between',
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectorValue: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: colors.text,
  },
  selectorPlaceholder: {
    color: colors.subduedText,
    fontWeight: '500',
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
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successSurface,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  successText: {
    fontSize: scaleFont(14),
    color: colors.success,
    fontWeight: '500',
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
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    color: colors.text,
  },
  sheetOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetOptionSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  sheetOptionLabel: {
    fontSize: scaleFont(16),
    color: colors.text,
    fontWeight: '600',
  },
});
