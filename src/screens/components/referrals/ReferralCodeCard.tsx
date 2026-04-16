import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import Animated from 'react-native-reanimated';
import { SurfaceCard } from '../../../components/SurfaceCard';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type Props = {
  code: string;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
  bump: Animated.SharedValue<number>;
};

export function ReferralCodeCard({
  code,
  copied,
  onCopy,
  onShare,
  bump,
}: Props) {
  return (
    <SurfaceCard style={styles.codeCard}>
      <View style={styles.codeHeader}>
        <Icon name="share-2" size={16} color={colors.surface} />
        <Text style={styles.codeLabel}>Your Referral Code</Text>
      </View>
      <Animated.Text
        style={[styles.codeText, { transform: [{ scale: bump }] }]}
      >
        {copied ? 'COPIED!' : code}
      </Animated.Text>
      <View style={styles.codeActions}>
        <Pressable
          style={[styles.actionButton, styles.copyButton]}
          onPress={onCopy}
        >
          <Icon name="copy" size={16} color={colors.primary} />
          <Text style={[styles.actionText, styles.copyText]}>
            {copied ? 'Copied' : 'Copy Link'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.shareButton]}
          onPress={onShare}
        >
          <Icon name="share-2" size={16} color={colors.surface} />
          <Text style={[styles.actionText, styles.shareText]}>Share</Text>
        </Pressable>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  codeCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.text,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  codeLabel: {
    color: colors.surface,
    fontSize: scaleFont(14),
    fontWeight: '600',
  },
  codeText: {
    color: colors.surface,
    fontSize: scaleFont(26),
    fontWeight: '500',
    letterSpacing: 1,
  },
  codeActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  copyButton: {
    backgroundColor: colors.surface,
  },
  shareButton: {
    backgroundColor: colors.primaryMuted,
  },
  actionText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },
  copyText: {
    color: colors.primary,
  },
  shareText: {
    color: colors.surface,
  },
});
