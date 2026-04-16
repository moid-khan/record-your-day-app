import React, { useMemo, useState } from 'react';
import { FlatList, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { colors, spacing } from '../theme';
import { useAuthStore } from '../state/useAuthStore';
import { useScrollMomentumStop } from '../hooks/useScrollMomentumStop';
import {
  Header,
  SectionHeader,
  MetricsRow,
  ReferralCodeCard,
  HowItWorks,
  ReferralRow,
  type ReferralItem,
} from './components/referrals';

const SAMPLE_REFERRALS: ReferralItem[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    status: 'Completed',
    amount: 10,
    date: '2025-11-20',
  },
  {
    id: '2',
    name: 'Mike Chen',
    status: 'Active',
    amount: 5,
    date: '2025-11-23',
  },
];

const REFERRAL_CODE = 'RECORD2025';

export function ReferralsScreen() {
  const [copied, setCopied] = useState(false);
  const bump = useSharedValue(1);
  const isLoggingOut = useAuthStore(s => s.isLoggingOut);
  // Register FlatList with momentum manager - allows forced stop before logout
  const flatListRef = useScrollMomentumStop<FlatList<ReferralItem>>();

  const metrics = useMemo(
    () => [
      {
        label: 'Total Earned',
        icon: 'dollar-sign',
        value: '$15',
        highlight: true,
      },
      {
        label: 'Active Referrals',
        icon: 'users',
        value: '2',
        highlight: false,
      },
    ],
    [],
  );

  const howItWorks = useMemo(
    () => [
      {
        title: 'Share your link',
        body: 'Invite friends to join Record Your Day',
      },
      {
        title: 'They sign up',
        body: 'Friend creates account using your referral code',
      },
      {
        title: 'You both earn',
        body: 'Get $10 when they complete their first bounty',
      },
    ],
    [],
  );

  const handleCopy = () => {
    // Clipboard.setString(REFERRAL_CODE);
    setCopied(true);
    bump.value = withSequence(withSpring(1.05), withSpring(1));
    setTimeout(() => setCopied(false), 1600);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join Record Your Day with my code ${REFERRAL_CODE}`,
      });
    } catch {
      // ignore share cancel/errors
    }
  };

  // NOTE: We intentionally keep the FlatList mounted during logout.
  // The LogoutOverlay in AppNavigator covers it visually.
  // Unmounting causes race conditions with native scroll events.

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        ref={flatListRef}
        contentContainerStyle={styles.content}
        data={SAMPLE_REFERRALS}
        keyExtractor={item => item.id}
        scrollEnabled={!isLoggingOut}
        bounces={!isLoggingOut}
        ListHeaderComponent={
          <>
            <Header />

            <SectionHeader
              title="Referrals"
              subtitle="Earn $10 for each friend who completes their first bounty"
            />

            <MetricsRow metrics={metrics} />

            <ReferralCodeCard
              code={REFERRAL_CODE}
              copied={copied}
              onCopy={handleCopy}
              onShare={handleShare}
              bump={bump}
            />

            <HowItWorks steps={howItWorks} />

            <SectionHeader title="Your Referrals" />
          </>
        }
        renderItem={({ item }) => <ReferralRow item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
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
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
    paddingTop: spacing.xl,
  },
});
