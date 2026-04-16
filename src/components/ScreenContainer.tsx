import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { useAuthStore } from '../state/useAuthStore';
import { useScrollMomentumStop } from '../hooks/useScrollMomentumStop';

type ScreenContainerProps = {
  children: React.ReactNode;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function ScreenContainer({
  children,
  scrollable = false,
  contentContainerStyle,
}: ScreenContainerProps) {
  const isLoggingOut = useAuthStore(s => s.isLoggingOut);
  // Register ScrollView with momentum manager - allows forced stop before logout
  const scrollRef = useScrollMomentumStop<ScrollView>();

  if (scrollable) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isLoggingOut}
          bounces={!isLoggingOut}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.contentContainer, contentContainerStyle]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
