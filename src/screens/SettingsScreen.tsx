import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { Button } from '../components/Button';
import { SurfaceCard } from '../components/SurfaceCard';
import { colors, radii, spacing } from '../theme';
import { scaleFont } from '../theme/scale';
import { ProfileField } from './components/settings/ProfileField';
import { OptionSheet } from './components/settings/OptionSheet';
import { useLogout } from '../hooks/useAuth';
import { useAuthStore } from '../state/useAuthStore';
import { useScrollMomentumStop } from '../hooks/useScrollMomentumStop';

const heightOptions = [
  { label: 'Under 5\'0"', value: 'Under 5\'0"' },
  { label: '5\'0" - 5\'3"', value: '5\'0" - 5\'3"' },
  { label: '5\'4" - 5\'7"', value: '5\'4" - 5\'7"' },
  { label: '5\'8" - 5\'11"', value: '5\'8" - 5\'11"' },
  { label: '6\'0" - 6\'3"', value: '6\'0" - 6\'3"' },
  { label: 'Over 6\'3"', value: 'Over 6\'3"' },
];

export function SettingsScreen() {
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    height: '',
    job: '',
  });
  const [heightModalOpen, setHeightModalOpen] = useState(false);
  const { mutate: logout, isPending: isMutationPending } = useLogout();
  const isLoggingOut = useAuthStore(s => s.isLoggingOut);
  // Register ScrollView with momentum manager - allows forced stop before logout
  const scrollRef = useScrollMomentumStop<ScrollView>();

  const handleSignOutPress = () => {
    // Show confirmation dialog - the actual logout transition with overlay
    // is handled by startLogout in the auth store
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            console.log('🚪 Sign out confirmed, calling logout...');
            logout();
          },
        },
      ],
    );
  };

  const handleChange = (key: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleEdit = () => setIsEditing((prev) => !prev);

  // NOTE: We intentionally keep the ScrollView mounted during logout.
  // The LogoutOverlay in AppNavigator covers it visually.
  // Unmounting causes race conditions with native scroll events.

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        bounces={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isLoggingOut}
      >
        <Text style={styles.title}>Record Your Day</Text>

        <View style={styles.topRow}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <Button
            title={isEditing ? 'Done' : 'Edit Profile'}
            onPress={toggleEdit}
            style={styles.editButton}
            textStyle={styles.editText}
            leftIcon={<Icon name="edit-2" size={16} color={colors.surface} />}
          />
        </View>

        <SurfaceCard style={styles.card}>
          <Text style={styles.cardTitle}>Profile Information</Text>
          <View style={styles.divider} />
          <ProfileField
            label="Full Name"
            icon="user"
            value={values.name}
            editable={isEditing}
            placeholder="Full Name"
            onChangeText={(t) => handleChange('name', t)}
          />
          <ProfileField
            label="Email"
            icon="mail"
            value={values.email}
            editable={isEditing}
            placeholder="Email"
            keyboardType="email-address"
            onChangeText={(t) => handleChange('email', t)}
          />
          <ProfileField
            label="Phone Number"
            icon="phone"
            value={values.phone}
            editable={isEditing}
            placeholder="Phone number"
            keyboardType="phone-pad"
            onChangeText={(t) => handleChange('phone', t)}
          />
          <ProfileField
            label="Height"
            icon="maximize-2"
            value={values.height}
            editable={false}
            placeholder="Select height"
            onPress={() => setHeightModalOpen(true)}
            onChangeText={() => {}}
          />
          <ProfileField
            label="Full Time Job (optional)"
            icon="briefcase"
            value={values.job}
            editable={isEditing}
            placeholder="Job"
            onChangeText={(t) => handleChange('job', t)}
          />

          {isEditing ? (
            <Animated.View
              entering={FadeInDown.duration(220)}
              exiting={FadeOutDown.duration(180)}
              style={styles.editActions}
            >
              <Button
                title="Save Changes"
                onPress={toggleEdit}
                style={styles.saveButton}
              />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={toggleEdit}
              />
            </Animated.View>
          ) : null}
        </SurfaceCard>

      <SurfaceCard style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <View style={styles.divider} />
        <Button
          title={isMutationPending ? 'Signing Out...' : 'Sign Out'}
          variant="secondary"
          onPress={handleSignOutPress}
          disabled={isMutationPending}
          leftIcon={<Icon name="log-out" size={18} color={colors.warning} />}
          textStyle={styles.signOutText}
          style={styles.signOutButton}
        />
        </SurfaceCard>

        <Text style={styles.footerText}>Record Your Day v1.0.0</Text>
      </ScrollView>
      <OptionSheet
        visible={heightModalOpen}
        title="Select height"
        options={heightOptions}
        selectedValue={values.height}
        onClose={() => setHeightModalOpen(false)}
        onSelect={(val) => {
          setValues((prev) => ({ ...prev, height: val }));
          setHeightModalOpen(false);
        }}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  title: {
    fontSize: scaleFont(22),
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: colors.text,
  },
  editButton: {
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  editText: {
    color: colors.surface,
  },
  card: {
    padding: spacing.md,
    borderRadius: radii.lg,
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    color: colors.text,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  saveButton: {
    flex: 1,
  },
  signOutButton: {
    borderColor: colors.warning,
  },
  signOutText: {
    color: colors.warning,
  },
  footerText: {
    textAlign: 'center',
    color: colors.subduedText,
    fontSize: scaleFont(13),
    marginTop: spacing.md,
  },
});
