import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CookieManager from '@react-native-cookies/cookies';
import { api, ApiException, fetchCsrfToken } from '../lib/api';
import { useAuthStore } from '../state/useAuthStore';
import { cookieStorage, type StoredCookies } from '../lib/storage';
import type {
  LoginRequest,
  SignupRequest,
  SignupResponse,
  GetMeResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '../types/auth';

const API_DOMAIN = 'https://dev.recordyourday.com';

/**
 * Save current cookies to MMKV for persistence across app restarts
 */
async function saveCookiesToStorage(): Promise<void> {
  try {
    const cookies = await CookieManager.get(API_DOMAIN);
    if (Object.keys(cookies).length > 0) {
      cookieStorage.setCookies(cookies as StoredCookies);
      console.log('🍪 Saved', Object.keys(cookies).length, 'cookies to MMKV');
    }
  } catch (error) {
    console.error('❌ Failed to save cookies to storage:', error);
  }
}

/**
 * Restore cookies from MMKV storage to CookieManager
 * Call this on app startup to restore session
 */
export async function restoreCookiesFromStorage(): Promise<boolean> {
  try {
    const storedCookies = cookieStorage.getCookies();
    if (!storedCookies || Object.keys(storedCookies).length === 0) {
      console.log('🍪 No stored cookies found in MMKV');
      return false;
    }

    console.log('🍪 Restoring', Object.keys(storedCookies).length, 'cookies from MMKV');

    // Restore each cookie to CookieManager
    for (const [name, cookie] of Object.entries(storedCookies)) {
      const cookieName = cookie.name || name;

      // IMPORTANT: __Host- prefixed cookies MUST NOT have a domain attribute
      // They are "host-only" cookies that can only be accessed by the exact host
      // Setting a domain would make them invalid
      const isHostCookie = cookieName.startsWith('__Host-');

      const cookieConfig: {
        name: string;
        value: string;
        path: string;
        secure: boolean;
        httpOnly: boolean;
        domain?: string;
      } = {
        name: cookieName,
        value: cookie.value,
        path: cookie.path || '/',
        secure: cookie.secure ?? true,
        httpOnly: cookie.httpOnly ?? true,
      };

      // Only set domain for non-__Host- cookies
      if (!isHostCookie && cookie.domain) {
        cookieConfig.domain = cookie.domain;
      }

      console.log(`🍪 Restoring cookie: ${cookieName} (host-only: ${isHostCookie})`);
      await CookieManager.set(API_DOMAIN, cookieConfig);
    }

    console.log('🍪 Cookies restored successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to restore cookies from storage:', error);
    return false;
  }
}

// Debug function to log all cookies after login
async function logStoredCookies() {
  try {
    const cookies = await CookieManager.get(API_DOMAIN);
    console.log('🍪 Stored cookies after login:', JSON.stringify(cookies, null, 2));
    console.log('🍪 Cookie names:', Object.keys(cookies));
  } catch (error) {
    console.error('❌ Failed to get cookies:', error);
  }
}

// Query keys
export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};

// NextAuth session response type
type NextAuthSession = {
  user: {
    id: string;
    email: string;
    name?: string;
    phone?: string | null;
    isActor: boolean;
    isAdmin: boolean;
    roStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
    referralCode?: string;
  };
  expires: string;
};

// Login mutation - uses NextAuth credentials endpoint
export function useLogin() {
  const setAuth = useAuthStore(s => s.setAuth);

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      // Step 1: Fetch CSRF token
      const csrfToken = await fetchCsrfToken();
      console.log('🚀 ~ useLogin ~ csrfToken:', csrfToken);
      if (!csrfToken) {
        throw new ApiException({
          message: 'Failed to get CSRF token',
          statusCode: 500,
        });
      }

      // Step 2: Call NextAuth credentials callback (form-urlencoded format)
      const callbackResponse = await fetch(
        'https://dev.recordyourday.com/api/auth/callback/credentials',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          credentials: 'include',
          body: new URLSearchParams({
            email: credentials.email,
            password: credentials.password,
            csrfToken,
            redirect: 'false',
            json: 'true',
          }).toString(),
        },
      );
      console.log('🚀 ~ useLogin ~ callbackResponse status:', callbackResponse.status);

      // NextAuth returns 200 even for failed auth, check the response body
      const callbackData = await callbackResponse.json().catch(() => ({}));
      console.log('🚀 ~ useLogin ~ callbackData:', callbackData);

      // NextAuth returns { url, ok, error } format with redirect: false
      if (callbackData.error) {
        throw new ApiException({
          message: callbackData.error === 'CredentialsSignin' ? 'Invalid credentials' : callbackData.error,
          statusCode: 401,
        });
      }

      // Step 3: Fetch session to get user data
      const sessionResponse = await fetch(
        'https://dev.recordyourday.com/api/auth/session',
        {
          method: 'GET',
          credentials: 'include',
        },
      );
      console.log('🚀 ~ useLogin ~ sessionResponse status:', sessionResponse.status);

      const session: NextAuthSession = await sessionResponse.json();
      console.log('🚀 ~ useLogin ~ session:', session);

      if (!session.user) {
        throw new ApiException({
          message: 'Session not established. Please try again.',
          statusCode: 401,
        });
      }

      // Step 4: Get full user details from /user/me
      const meResponse = await api.get<{ user: GetMeResponse['data']['user'] }>('/user/me', true);
      console.log('🚀 ~ useLogin ~ meResponse:', meResponse);

      return {
        user: meResponse.user,
        token: csrfToken, // Use CSRF token as the auth identifier for session-based auth
      };
    },
    onSuccess: async data => {
      setAuth(data.user, data.token);
      // Log cookies to debug what's actually stored
      await logStoredCookies();
      // CRITICAL: Save cookies to MMKV for persistence across app restarts
      await saveCookiesToStorage();
    },
    onError: e => {
      console.log('🚀 ~ useLogin ~ e:', e);
    },
  });
}

// Signup mutation
export function useSignup() {
  const setAuth = useAuthStore(s => s.setAuth);

  return useMutation({
    mutationFn: async (data: SignupRequest) => {
      const response = await api.post<SignupResponse>('/auth/signup', data);
      return response;
    },
    onSuccess: data => {
      setAuth(data.data.user, data.data.token);
    },
  });
}

// Get current user query - uses /user/me endpoint
export function useMe(enabled = true) {
  const token = useAuthStore(s => s.token);

  return useQuery({
    queryKey: authKeys.me(),
    queryFn: async () => {
      const response = await api.get<GetMeResponse>('/user/me', true);
      return response.data.user;
    },
    enabled: enabled && !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

// Forgot password mutation
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (data: ForgotPasswordRequest) => {
      const response = await api.post<ForgotPasswordResponse>(
        '/auth/forgot-password',
        data,
      );
      return response;
    },
  });
}

// Reset password mutation
export function useResetPassword() {
  return useMutation({
    mutationFn: async (data: ResetPasswordRequest) => {
      const response = await api.post<ResetPasswordResponse>(
        '/auth/reset-password',
        data,
      );
      return response;
    },
  });
}

// Logout mutation - uses NextAuth signout endpoint
export function useLogout() {
  const startLogout = useAuthStore(s => s.startLogout);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      console.log('🚪 useLogout: mutationFn called');

      // CRITICAL: Set isLoggingOut IMMEDIATELY to stop all scrolls
      // This happens BEFORE the API call so scrolls are stopped as early as possible
      useAuthStore.setState({ isLoggingOut: true });
      console.log('🚪 useLogout: isLoggingOut set to true IMMEDIATELY');

      // Wait a moment for React to process the state change and disable scrolls
      await new Promise<void>(resolve => setTimeout(resolve, 100));

      // Get CSRF token for the signout request
      const csrfToken = await fetchCsrfToken();
      console.log('🚪 useLogout: CSRF token:', csrfToken ? 'present' : 'missing');

      // Call NextAuth signout endpoint
      try {
        console.log('🚪 useLogout: Calling signout API...');
        const response = await fetch(`${API_DOMAIN}/api/auth/signout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            csrfToken: csrfToken || '',
            callbackUrl: '/login',
            json: true,
          }),
        });
        console.log('🚪 useLogout: Signout response status:', response.status);

        const responseText = await response.text();
        console.log('🚪 useLogout: Signout response body:', responseText);

        // Clear cookies after signout
        await CookieManager.clearAll();
        console.log('🍪 useLogout: Cookies cleared');
      } catch (error) {
        console.error('❌ useLogout: Signout error:', error);
        // Still clear cookies even if API fails
        await CookieManager.clearAll();
        console.log('🍪 useLogout: Cookies cleared after error');
      }
    },
    onMutate: () => {
      console.log('🚪 useLogout: onMutate - mutation starting');
    },
    onSuccess: () => {
      console.log('🚪 useLogout: onSuccess - mutation completed successfully');
    },
    onError: (error) => {
      console.error('❌ useLogout: onError -', error);
    },
    onSettled: async () => {
      console.log('🚪 useLogout: onSettled - starting safe logout transition');

      // Use startLogout which waits for scroll events to settle
      // isLoggingOut is already true, so this just does the waiting
      await startLogout();
      queryClient.clear();
      console.log('🚪 useLogout: Logout complete');
    },
  });
}

// Helper to extract error message from API exception
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiException) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

// Helper to get field-specific error
export function getFieldError(
  error: unknown,
  field: string,
): string | undefined {
  if (error instanceof ApiException) {
    return error.getFieldError(field);
  }
  return undefined;
}
