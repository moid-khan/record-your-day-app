import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scaleFont } from '../theme/scale';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { colors, spacing } from '../theme';
import { Header } from './components/bounties/Header';
import { RequestBountyBar } from './components/bounties/RequestBountyBar';
import { RequestBountyCard } from './components/bounties/RequestBountyCard';
import { BountyCard, type BountyItem, transformApiBounty } from './components/bounties/BountyCard';
import { useTaskStore } from '../state/useTaskStore';
import { useRecordingStore } from '../state/useRecordingStore';
import { useAuthStore } from '../state/useAuthStore';
import { useScrollMomentumStop } from '../hooks/useScrollMomentumStop';
import { fetchBounties } from '../lib/api';

export function BountiesScreen() {
  const [showRequest, setShowRequest] = useState(false);
  const [bounties, setBounties] = useState<BountyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setTask = useTaskStore(s => s.setTask);
  const setIsTabLocked = useRecordingStore(s => s.setIsTabLocked);
  const setShowRecordingModal = useRecordingStore(s => s.setShowRecordingModal);
  const isLoggingOut = useAuthStore(s => s.isLoggingOut);
  // Register FlatList with momentum manager - allows forced stop before logout
  const flatListRef = useScrollMomentumStop<FlatList<BountyItem>>();

  const loadBounties = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const apiBounties = await fetchBounties();
      const transformed = apiBounties.map(transformApiBounty);
      setBounties(transformed);
    } catch (err) {
      console.error('Failed to fetch bounties:', err);
      setError(err instanceof Error ? err.message : 'Failed to load bounties');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBounties();
  }, [loadBounties]);

  const tasksAvailable = useMemo(() => bounties.length, [bounties]);

  // NOTE: We intentionally keep the FlatList mounted during logout.
  // The LogoutOverlay in AppNavigator covers it visually.
  // Unmounting causes race conditions with native scroll events.

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        ref={flatListRef}
        contentContainerStyle={styles.content}
        data={bounties}
        keyExtractor={item => item.id}
        scrollEnabled={!isLoggingOut}
        bounces={!isLoggingOut}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={loadBounties}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <Header />
            <RequestBountyBar
              tasksAvailable={tasksAvailable}
              onPress={() => setShowRequest(true)}
            />
            {showRequest ? (
              <Animated.View
                style={{ marginBottom: spacing.lg }}
                entering={FadeInDown.duration(200)}
                exiting={FadeOut.duration(180)}
              >
                <RequestBountyCard
                  onCancel={() => setShowRequest(false)}
                  onSubmit={() => setShowRequest(false)}
                />
              </Animated.View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading bounties...</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={loadBounties}>
                <Text style={styles.retryText}>Tap to retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No bounties available</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <BountyCard
            item={item}
            onAccept={bounty => {
              // Set task but don't auto-start recording. User starts via clap or button.
              setTask(bounty, false);
              // Lock tabs after accepting a bounty.
              setIsTabLocked(true);
              // Show recording modal (bypasses react-navigation to avoid header event crashes)
              setShowRecordingModal(true);
            }}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
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
    paddingTop: spacing.lg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: scaleFont(14),
    color: colors.subduedText,
  },
  errorText: {
    fontSize: scaleFont(14),
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    fontSize: scaleFont(14),
    color: colors.primary,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
  },
});
