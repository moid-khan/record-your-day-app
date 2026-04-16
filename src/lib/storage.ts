import { createMMKV, type MMKV } from 'react-native-mmkv';

// Create MMKV instance with error handling
let storage: MMKV | null = null;

function getStorage(): MMKV | null {
  if (storage) return storage;
  try {
    storage = createMMKV({ id: 'auth-storage' });
    return storage;
  } catch (error) {
    console.warn('Failed to initialize MMKV storage:', error);
    return null;
  }
}

// Export storage for backward compatibility (may be null)
export { getStorage as storage };

const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER: 'user',
  CSRF_TOKEN: 'csrf_token',
  SESSION_COOKIES: 'session_cookies',
} as const;

export const tokenStorage = {
  getToken: (): string | null => {
    try {
      const mmkv = getStorage();
      if (!mmkv) return null;
      return mmkv.getString(STORAGE_KEYS.AUTH_TOKEN) ?? null;
    } catch (error) {
      console.warn('Failed to get token from storage:', error);
      return null;
    }
  },

  setToken: (token: string): void => {
    try {
      const mmkv = getStorage();
      if (mmkv) {
        mmkv.set(STORAGE_KEYS.AUTH_TOKEN, token);
      }
    } catch (error) {
      console.warn('Failed to set token in storage:', error);
    }
  },

  removeToken: (): void => {
    try {
      const mmkv = getStorage();
      if (mmkv) {
        mmkv.remove(STORAGE_KEYS.AUTH_TOKEN);
      }
    } catch (error) {
      console.warn('Failed to remove token from storage:', error);
    }
  },
};

export type StoredUser = {
  id: string;
  email: string;
  name?: string;
  phone?: string | null;
  isActor: boolean;
  isAdmin: boolean;
  roStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  actorStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  referralCode?: string;
};

export const userStorage = {
  getUser: (): StoredUser | null => {
    try {
      const mmkv = getStorage();
      if (!mmkv) return null;
      const userJson = mmkv.getString(STORAGE_KEYS.USER);
      if (!userJson) return null;
      return JSON.parse(userJson) as StoredUser;
    } catch (error) {
      console.warn('Failed to get user from storage:', error);
      return null;
    }
  },

  setUser: (user: StoredUser): void => {
    try {
      const mmkv = getStorage();
      if (mmkv) {
        mmkv.set(STORAGE_KEYS.USER, JSON.stringify(user));
      }
    } catch (error) {
      console.warn('Failed to set user in storage:', error);
    }
  },

  removeUser: (): void => {
    try {
      const mmkv = getStorage();
      if (mmkv) {
        mmkv.remove(STORAGE_KEYS.USER);
      }
    } catch (error) {
      console.warn('Failed to remove user from storage:', error);
    }
  },
};

export const csrfStorage = {
  getCsrfToken: (): string | null => {
    try {
      const mmkv = getStorage();
      if (!mmkv) return null;
      return mmkv.getString(STORAGE_KEYS.CSRF_TOKEN) ?? null;
    } catch (error) {
      console.warn('Failed to get CSRF token from storage:', error);
      return null;
    }
  },

  setCsrfToken: (token: string): void => {
    try {
      const mmkv = getStorage();
      if (mmkv) {
        mmkv.set(STORAGE_KEYS.CSRF_TOKEN, token);
      }
    } catch (error) {
      console.warn('Failed to set CSRF token in storage:', error);
    }
  },

  removeCsrfToken: (): void => {
    try {
      const mmkv = getStorage();
      if (mmkv) {
        mmkv.remove(STORAGE_KEYS.CSRF_TOKEN);
      }
    } catch (error) {
      console.warn('Failed to remove CSRF token from storage:', error);
    }
  },
};

// Cookie storage for persisting NextAuth session cookies across app restarts
export type StoredCookies = {
  [key: string]: {
    value: string;
    name: string;
    domain?: string;
    path?: string;
    expires?: string;
    secure?: boolean;
    httpOnly?: boolean;
  };
};

export const cookieStorage = {
  getCookies: (): StoredCookies | null => {
    try {
      const mmkv = getStorage();
      if (!mmkv) return null;
      const cookiesJson = mmkv.getString(STORAGE_KEYS.SESSION_COOKIES);
      if (!cookiesJson) return null;
      return JSON.parse(cookiesJson) as StoredCookies;
    } catch (error) {
      console.warn('Failed to get cookies from storage:', error);
      return null;
    }
  },

  setCookies: (cookies: StoredCookies): void => {
    try {
      const mmkv = getStorage();
      if (mmkv) {
        mmkv.set(STORAGE_KEYS.SESSION_COOKIES, JSON.stringify(cookies));
        console.log('🍪 Cookies saved to MMKV storage');
      }
    } catch (error) {
      console.warn('Failed to set cookies in storage:', error);
    }
  },

  removeCookies: (): void => {
    try {
      const mmkv = getStorage();
      if (mmkv) {
        mmkv.remove(STORAGE_KEYS.SESSION_COOKIES);
      }
    } catch (error) {
      console.warn('Failed to remove cookies from storage:', error);
    }
  },
};

export const authStorage = {
  clear: (): void => {
    try {
      tokenStorage.removeToken();
      userStorage.removeUser();
      csrfStorage.removeCsrfToken();
      cookieStorage.removeCookies();
    } catch (error) {
      console.warn('Failed to clear auth storage:', error);
    }
  },
};
