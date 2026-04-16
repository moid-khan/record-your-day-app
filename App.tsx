import 'react-native-gesture-handler';
import 'react-native-reanimated';
import BootSplash from 'react-native-bootsplash';

import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';

// Ignore specific warnings that can occur during navigation transitions
// The topMomentumScrollEnd warning happens when ScrollView is unmounted during scroll
LogBox.ignoreLogs([
  'instanceHandle is null',
  'topMomentumScrollEnd',
  'will be dropped',
]);
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppNavigator } from './src/navigation/AppNavigator';
import { RecordingModal } from './src/components/RecordingModal';
import { UploadProgressBar } from './src/components/UploadProgressBar';
import { colors } from './src/theme';
import { useAuthStore } from './src/state/useAuthStore';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import {
  requestCameraPermission,
  requestMicrophonePermission,
  requestNotificationPermission,
} from './src/utils/permissions';
import { initBackgroundUpload } from './src/lib/backgroundUpload';
import { initUploadQueue } from './src/lib/uploadQueue';
import { api } from './src/lib/api';
import { restoreCookiesFromStorage } from './src/hooks/useAuth';
import { OfflineUploadBanner } from './src/components/OfflineUploadBanner';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    },
    mutations: {
      retry: 0,
    },
  },
});

function AppContent(): React.JSX.Element {
  const hydrate = useAuthStore(s => s.hydrate);
  const logout = useAuthStore(s => s.logout);
  const token = useAuthStore(s => s.token);
  const isHydrated = useAuthStore(s => s.isHydrated);

  useEffect(() => {
    // Hydrate auth state from MMKV storage
    hydrate();
    // Initialize background upload service
    initBackgroundUpload();
    // Initialize upload queue manager (handles offline uploads)
    initUploadQueue();
  }, [hydrate]);

  // Restore cookies and verify session after hydration
  useEffect(() => {
    if (!isHydrated || !token) return;

    const restoreAndVerifySession = async () => {
      try {
        // CRITICAL: First restore cookies from MMKV storage
        // This ensures session cookies persist across app restarts
        console.log('🍪 Restoring cookies from storage...');
        await restoreCookiesFromStorage();

        console.log('🔐 Verifying session...');
        // Try to fetch user data to verify session is valid
        await api.get('/user/me', true);
        console.log('✅ Session is valid');
      } catch (error: any) {
        console.log('❌ Session invalid, logging out:', error?.message);
        // Session is invalid, force logout
        logout();
      }
    };

    restoreAndVerifySession();
  }, [isHydrated, token, logout]);

  useEffect(() => {
    const init = async () => {
      // …do multiple sync or async tasks
    };

    init().finally(async () => {
      await BootSplash.hide({ fade: true });
      console.log('BootSplash has been hidden successfully');
    });
  }, []);

  useEffect(() => {
    // Request permissions at launch so they are not gated by stepper.
    const requestPermissions = async () => {
      try {
        await requestCameraPermission();
        await requestMicrophonePermission();
        await requestNotificationPermission();
      } catch {
        // ignore errors for now; OS will control prompts
      }
    };
    requestPermissions();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaProvider>
          <StatusBar
            barStyle="dark-content"
            backgroundColor={colors.background}
          />
          <AppNavigator />
          {/* RecordingModal is rendered outside navigation to avoid topHeaderHeightChange crashes */}
          <RecordingModal />
          {/* Offline upload banner - shows pending/failed uploads */}
          <OfflineUploadBanner />
          {/* Upload progress indicator - shown globally */}
          <UploadProgressBar />
        </SafeAreaProvider>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
