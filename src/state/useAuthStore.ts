import { create } from 'zustand';
import { InteractionManager } from 'react-native';
import { tokenStorage, userStorage, authStorage, cookieStorage, type StoredUser } from '../lib/storage';
import { scrollMomentumManager } from '../utils/scrollMomentumManager';
import type { User } from '../types/auth';

type AuthStatus = 'unauthenticated' | 'pending' | 'profile_incomplete' | 'authenticated';

type AuthState = {
  status: AuthStatus;
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isHydrated: boolean;
  // Logout transition state - shows overlay while waiting for scroll momentum to settle
  isLoggingOut: boolean;

  // Actions
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  // Start logout transition - shows overlay, waits, then calls logout
  startLogout: () => Promise<void>;
  hydrate: () => void;
};

function getStatusFromUser(user: User | null): AuthStatus {
  if (!user) return 'unauthenticated';

  // Admin users are always authenticated
  if (user.isAdmin) return 'authenticated';

  // For actors, check profile completion and approval status
  if (user.isActor) {
    // Check if profile is incomplete (phone is required)
    if (!user.phone) return 'profile_incomplete';
    // Check if actor is pending approval
    if (user.actorStatus === 'PENDING') return 'pending';
    // Check if actor is approved
    if (user.actorStatus === 'APPROVED') return 'authenticated';
    // Actor with phone but no status set yet - might be newly registered
    if (!user.actorStatus || user.actorStatus === 'NONE') return 'profile_incomplete';
    // Rejected actors
    return 'unauthenticated';
  }

  // For RO users, check RO status
  if (user.roStatus === 'PENDING') return 'pending';
  if (user.roStatus === 'APPROVED') {
    if (!user.phone) return 'profile_incomplete';
    return 'authenticated';
  }

  return 'unauthenticated';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unauthenticated',
  user: null,
  token: null,
  isLoading: true,
  isHydrated: false,
  isLoggingOut: false,

  setAuth: (user: User, token: string) => {
    try {
      // Persist to MMKV
      tokenStorage.setToken(token);
      userStorage.setUser(user as StoredUser);

      const status = getStatusFromUser(user);
      set({
        user,
        token,
        status,
        isLoading: false,
      });
    } catch (error) {
      console.warn('Failed to set auth:', error);
      // Still update state even if storage fails
      const status = getStatusFromUser(user);
      set({
        user,
        token,
        status,
        isLoading: false,
      });
    }
  },

  setUser: (user: User) => {
    try {
      // Persist to MMKV
      userStorage.setUser(user as StoredUser);

      const status = getStatusFromUser(user);
      set({
        user,
        status,
        isLoading: false,
      });
    } catch (error) {
      console.warn('Failed to set user:', error);
      // Still update state even if storage fails
      const status = getStatusFromUser(user);
      set({
        user,
        status,
        isLoading: false,
      });
    }
  },

  logout: () => {
    // Direct logout - use startLogout() for safe logout with transition
    try {
      // Clear all storage including cookies
      authStorage.clear();
      cookieStorage.clearCookies();
    } catch (error) {
      console.warn('Failed to clear storage on logout:', error);
    }

    // Update state
    set({
      user: null,
      token: null,
      status: 'unauthenticated',
      isLoading: false,
      isLoggingOut: false,
    });
  },

  startLogout: async () => {
    // CRITICAL: This function handles the logout transition safely
    // It FORCEFULLY stops all scroll momentum before changing auth state
    console.log('🚪 startLogout: Beginning safe logout transition');

    // Step 1: IMMEDIATELY stop all scroll momentum
    // This calls scrollTo({y: 0, animated: false}) on ALL registered scroll views
    // This cancels momentum at the native level - critical to prevent crashes
    console.log('🚪 startLogout: Forcefully stopping all scroll momentum...');
    scrollMomentumManager.stopAll();

    // Step 2: Wait a frame for the scrollTo commands to execute at native level
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await new Promise<void>(resolve => setTimeout(resolve, 50));

    // Step 3: Set isLoggingOut to true (shows overlay, disables scrolling)
    set({ isLoggingOut: true });
    console.log('🚪 startLogout: Overlay shown, scrolling disabled');

    // Step 4: Stop momentum again (in case any new momentum started)
    scrollMomentumManager.stopAll();

    // Step 5: Wait for InteractionManager
    await new Promise<void>(resolve => {
      InteractionManager.runAfterInteractions(() => {
        console.log('🚪 startLogout: Interactions complete');
        resolve();
      });
    });

    // Step 6: Wait for native event queue to fully drain
    // Even with momentum stopped, there may be queued events
    console.log('🚪 startLogout: Waiting for native event queue to drain...');
    await new Promise<void>(resolve => setTimeout(resolve, 500));

    // Step 7: Final momentum stop and frame flush
    scrollMomentumManager.stopAll();
    for (let i = 0; i < 5; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }

    console.log('🚪 startLogout: All scroll momentum stopped, changing auth status');

    // Step 7: Now actually clear the auth state
    try {
      authStorage.clear();
      cookieStorage.clearCookies();
    } catch (error) {
      console.warn('Failed to clear storage on logout:', error);
    }

    set({
      user: null,
      token: null,
      status: 'unauthenticated',
      isLoading: false,
      isLoggingOut: false,
    });
    console.log('🚪 startLogout: Logout complete');
  },

  hydrate: () => {
    if (get().isHydrated) return;

    try {
      const token = tokenStorage.getToken();
      const user = userStorage.getUser();

      if (token && user) {
        const status = getStatusFromUser(user as User);
        set({
          user: user as User,
          token,
          status,
          isLoading: false,
          isHydrated: true,
        });
      } else {
        set({
          isLoading: false,
          isHydrated: true,
        });
      }
    } catch (error) {
      console.warn('Failed to hydrate auth:', error);
      set({
        isLoading: false,
        isHydrated: true,
      });
    }
  },
}));

// Selectors for common use cases
export const selectIsAuthenticated = (state: AuthState) =>
  state.status === 'authenticated';
export const selectIsPending = (state: AuthState) => state.status === 'pending';
export const selectIsProfileIncomplete = (state: AuthState) =>
  state.status === 'profile_incomplete';
export const selectUser = (state: AuthState) => state.user;
export const selectToken = (state: AuthState) => state.token;
