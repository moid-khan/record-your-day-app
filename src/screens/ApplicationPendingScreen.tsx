import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { Button } from '../components/Button';
import { useAuthStore } from '../state/useAuthStore';
import { colors, radii, spacing } from '../theme';
import { scaleFont } from '../theme/scale';

export function ApplicationPendingScreen() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Icon name="clock" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>Application in process</Text>
        <Text style={styles.subtitle}>
          We will get back to you within 24 hours through your email.
        </Text>
        <Button title="Okay" onPress={() => {}} />
        <Pressable onPress={logout} style={styles.logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: scaleFont(20),
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  logout: {
    paddingVertical: spacing.sm,
  },
  logoutText: {
    color: colors.subduedText,
    fontWeight: '600',
    fontSize: scaleFont(14),
  },
});
