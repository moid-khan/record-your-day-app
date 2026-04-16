import Upload from 'react-native-background-upload';
import { Platform } from 'react-native';
import CookieManager from '@react-native-cookies/cookies';
import { tokenStorage, csrfStorage, cookieStorage } from './storage';

const API_BASE_URL = 'https://dev.recordyourday.com/api';
const API_DOMAIN = 'https://dev.recordyourday.com';

/**
 * Verify the current session is still valid before uploading
 * Returns true if session is valid, false if expired/invalid
 *
 * IMPORTANT: Uses credentials: 'include' to let React Native automatically
 * send cookies from CookieManager, just like api.ts does. Do NOT manually
 * set Cookie headers as it can conflict with automatic cookie handling.
 */
async function verifySessionBeforeUpload(): Promise<boolean> {
  try {
    // First check if we have any cookies at all
    const cookies = await CookieManager.get(API_DOMAIN);
    const cookieNames = Object.keys(cookies);
    console.log('🍪 Cookies in CookieManager:', cookieNames);

    if (cookieNames.length === 0) {
      console.log('⚠️ No session cookies found for upload verification');
      return false;
    }

    // Make a request to verify the session
    // Use credentials: 'include' to automatically send cookies (same as api.ts)
    console.log('🔐 Verifying session before upload...');
    const response = await fetch(`${API_BASE_URL}/user/me`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (response.ok) {
      console.log('✅ Session verified before upload');
      return true;
    } else {
      console.log(`⚠️ Session verification failed: ${response.status}`);

      // Session is invalid - clear stale cookies from MMKV storage
      // This prevents using expired cookies on next app restart
      if (response.status === 401 || response.status === 403) {
        console.log('🍪 Clearing stale cookies from storage...');
        cookieStorage.removeCookies();
        await CookieManager.clearAll();
      }

      return false;
    }
  } catch (error) {
    console.error('❌ Session verification error:', error);
    return false;
  }
}

/**
 * Get NextAuth session cookies from the cookie store
 * The API requires these cookies for authentication:
 * - __Host-next-auth.csrf-token
 * - __Secure-next-auth.callback-url
 * - __Secure-next-auth.session-token
 */
async function getSessionCookies(): Promise<string | null> {
  try {
    // Get cookies for the API domain
    const cookies = await CookieManager.get(API_DOMAIN);
    console.log('🍪 All cookies for domain:', JSON.stringify(Object.keys(cookies)));

    const cookieParts: string[] = [];

    // Include ALL cookies from the domain - the server needs them all
    for (const [name, cookie] of Object.entries(cookies)) {
      cookieParts.push(`${name}=${cookie.value}`);
      console.log(`🍪 Cookie: ${name} = ${cookie.value.substring(0, 20)}...`);
    }

    if (cookieParts.length === 0) {
      console.log('⚠️ No cookies found for domain');
      return null;
    }

    const cookieHeader = cookieParts.join('; ');
    console.log('🍪 Cookie header built with', cookieParts.length, 'cookies');
    return cookieHeader;
  } catch (error) {
    console.error('❌ Failed to get cookies:', error);
    return null;
  }
}

export type UploadParams = {
  filePath: string;
  siteId: string;
  bountyId: string;
  title: string;
  description?: string;
  durationSeconds?: number;
};

export type UploadProgress = {
  uploadId: string;
  progress: number; // 0-100
};

export type UploadResult = {
  uploadId: string;
  responseCode: number;
  responseBody: string;
};

export type UploadError = {
  uploadId: string;
  error: string;
};

// Event listeners
type ProgressListener = (data: UploadProgress) => void;
type CompletedListener = (data: UploadResult) => void;
type ErrorListener = (data: UploadError) => void;

const progressListeners: Map<string, ProgressListener> = new Map();
const completedListeners: Map<string, CompletedListener> = new Map();
const errorListeners: Map<string, ErrorListener> = new Map();

/**
 * Initialize background upload event listeners
 * Call this once at app startup
 */
export function initBackgroundUpload() {
  // Progress event - null uploadId means listen to all uploads
  Upload.addListener('progress', null, (data) => {
    console.log(`📤 Upload progress [${data.id}]: ${data.progress}%`);
    const listener = progressListeners.get(data.id);
    if (listener) {
      listener({ uploadId: data.id, progress: data.progress });
    }
  });

  // Completed event
  Upload.addListener('completed', null, (data) => {
    console.log(`✅ Upload completed [${data.id}]: status ${data.responseCode}`);
    console.log(`📥 Response body:`, data.responseBody);
    const listener = completedListeners.get(data.id);
    if (listener) {
      listener({
        uploadId: data.id,
        responseCode: data.responseCode,
        responseBody: data.responseBody,
      });
    }
    // Cleanup listeners
    progressListeners.delete(data.id);
    completedListeners.delete(data.id);
    errorListeners.delete(data.id);
  });

  // Error event
  Upload.addListener('error', null, (data) => {
    console.error(`❌ Upload error [${data.id}]:`, data.error);
    const listener = errorListeners.get(data.id);
    if (listener) {
      listener({ uploadId: data.id, error: data.error });
    }
    // Cleanup listeners
    progressListeners.delete(data.id);
    completedListeners.delete(data.id);
    errorListeners.delete(data.id);
  });

  // Cancelled event
  Upload.addListener('cancelled', null, (data) => {
    console.log(`🚫 Upload cancelled [${data.id}]`);
    // Cleanup listeners
    progressListeners.delete(data.id);
    completedListeners.delete(data.id);
    errorListeners.delete(data.id);
  });

  console.log('📤 Background upload service initialized');
}

/**
 * Upload a recorded video/audio file to the server
 * On iOS: Uses fetch with FormData (supports cookies for session auth)
 * On Android: Uses background upload service (continues even if app is killed)
 */
export async function uploadRecording(
  params: UploadParams,
  callbacks?: {
    onProgress?: ProgressListener;
    onCompleted?: CompletedListener;
    onError?: ErrorListener;
  },
): Promise<string> {
  const { filePath, siteId, bountyId, title, description, durationSeconds } = params;

  // Get auth token
  const token = tokenStorage.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  // Verify session is still valid before attempting upload
  const isSessionValid = await verifySessionBeforeUpload();
  if (!isSessionValid) {
    console.error('❌ Session expired or invalid - cannot upload');
    throw new Error('Session expired. Please log in again.');
  }

  // Get CSRF token for POST request
  const csrfToken = csrfStorage.getCsrfToken();
  console.log('📤 Auth token:', token ? 'present' : 'missing');
  console.log('📤 CSRF token:', csrfToken ? 'present' : 'missing');

  // Normalize file path
  let normalizedPath = filePath;
  if (filePath.startsWith('file://')) {
    normalizedPath = filePath.replace('file://', '');
  }

  // Determine file type based on extension
  const extension = filePath.split('.').pop()?.toLowerCase();
  let mimeType = 'video/mp4';
  if (extension === 'm4a' || extension === 'aac') {
    mimeType = 'audio/m4a';
  } else if (extension === 'mp3') {
    mimeType = 'audio/mpeg';
  } else if (extension === 'wav') {
    mimeType = 'audio/wav';
  } else if (extension === 'mov') {
    mimeType = 'video/quicktime';
  }

  // Build form fields
  const fields: Record<string, string> = {
    siteId,
    bountyId,
    title,
  };

  if (description) {
    fields.description = description;
  }

  if (durationSeconds !== undefined) {
    fields.durationSeconds = String(durationSeconds);
  }

  console.log('📤 Starting upload:', {
    url: `${API_BASE_URL}/uploads/actor/videos`,
    path: normalizedPath,
    mimeType,
    fields,
    platform: Platform.OS,
  });

  // iOS: Use XMLHttpRequest with withCredentials=true (automatic cookie handling)
  if (Platform.OS === 'ios') {
    return uploadWithFetch(normalizedPath, mimeType, fields, csrfToken, callbacks);
  }

  // Android: Get session cookies for manual Cookie header
  const sessionCookies = await getSessionCookies();
  console.log('🍪 Session cookies for Android:', sessionCookies ? 'present' : 'missing');

  // Android: Use background upload service
  // Build headers - use ONLY cookies for auth (like Postman)
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  // Add session cookies for NextAuth authentication
  if (sessionCookies) {
    headers['Cookie'] = sessionCookies;
    console.log('📤 Android using cookie-based auth');
  } else {
    // Fallback to Bearer token if no cookies
    headers['Authorization'] = `Bearer ${token}`;
    console.log('📤 Android no cookies, using Bearer token fallback');
  }

  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  console.log('📤 Android upload headers:', Object.keys(headers));

  const uploadId = await Upload.startUpload({
    url: `${API_BASE_URL}/uploads/actor/videos`,
    path: normalizedPath,
    method: 'POST',
    type: 'multipart',
    field: 'file',
    headers,
    parameters: fields,
    notification: {
      enabled: true,
      autoClear: true,
      notificationChannel: 'upload-channel',
      enableRingTone: false,
      onProgressTitle: 'Uploading recording...',
      onProgressMessage: 'Upload in progress',
      onCompleteTitle: 'Upload complete',
      onCompleteMessage: 'Your recording has been uploaded',
      onErrorTitle: 'Upload failed',
      onErrorMessage: 'Failed to upload recording',
    },
  });

  console.log(`📤 Upload started with ID: ${uploadId}`);

  // Register callbacks
  if (callbacks?.onProgress) {
    progressListeners.set(uploadId, callbacks.onProgress);
  }
  if (callbacks?.onCompleted) {
    completedListeners.set(uploadId, callbacks.onCompleted);
  }
  if (callbacks?.onError) {
    errorListeners.set(uploadId, callbacks.onError);
  }

  return uploadId;
}

/**
 * iOS-specific upload using XMLHttpRequest for proper progress tracking
 * This supports cookies for session-based authentication and real progress events
 *
 * IMPORTANT: Uses withCredentials=true to let the native layer automatically
 * send cookies from CookieManager. Do NOT manually set Cookie headers.
 */
async function uploadWithFetch(
  filePath: string,
  mimeType: string,
  fields: Record<string, string>,
  csrfToken: string | null,
  callbacks?: {
    onProgress?: ProgressListener;
    onCompleted?: CompletedListener;
    onError?: ErrorListener;
  },
): Promise<string> {
  const uploadId = `ios-xhr-${Date.now()}`;

  return new Promise((resolve, reject) => {
    try {
      // Create FormData
      const formData = new FormData();

      // Add the file
      const fileName = filePath.split('/').pop() || 'recording.mp4';
      formData.append('file', {
        uri: `file://${filePath}`,
        type: mimeType,
        name: fileName,
      } as any);

      // Add other fields
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });

      console.log('📤 iOS XMLHttpRequest upload starting...');

      // Report initial progress
      callbacks?.onProgress?.({ uploadId, progress: 0 });

      // Use XMLHttpRequest for progress events
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          console.log(`📤 iOS upload progress: ${progress}% (${event.loaded}/${event.total})`);
          callbacks?.onProgress?.({ uploadId, progress });
        }
      };

      // Handle completion
      xhr.onload = () => {
        const responseBody = xhr.responseText;
        console.log(`📤 iOS upload response: ${xhr.status}`);
        console.log(`📥 Response body:`, responseBody);

        // Report 100% progress
        callbacks?.onProgress?.({ uploadId, progress: 100 });

        callbacks?.onCompleted?.({
          uploadId,
          responseCode: xhr.status,
          responseBody,
        });

        if (xhr.status < 200 || xhr.status >= 300) {
          console.error(`❌ Upload failed with status ${xhr.status}: ${responseBody}`);
        }

        resolve(uploadId);
      };

      // Handle errors
      xhr.onerror = () => {
        const errorMessage = 'Network error during upload';
        console.error('❌ iOS upload network error');
        callbacks?.onError?.({ uploadId, error: errorMessage });
        reject(new Error(errorMessage));
      };

      xhr.ontimeout = () => {
        const errorMessage = 'Upload timed out';
        console.error('❌ iOS upload timeout');
        callbacks?.onError?.({ uploadId, error: errorMessage });
        reject(new Error(errorMessage));
      };

      // Open connection
      xhr.open('POST', `${API_BASE_URL}/uploads/actor/videos`);

      // Set timeout (5 minutes for large files)
      xhr.timeout = 300000;

      // IMPORTANT: Enable credentials BEFORE setting headers
      // This tells XMLHttpRequest to automatically include cookies from CookieManager
      xhr.withCredentials = true;

      // Set headers - do NOT manually set Cookie header
      // withCredentials=true will handle cookie inclusion automatically
      xhr.setRequestHeader('Accept', 'application/json');

      if (csrfToken) {
        xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      }

      console.log('📤 iOS upload with withCredentials=true (automatic cookie handling)');

      // Send the request
      xhr.send(formData);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ iOS upload error:', errorMessage);
      callbacks?.onError?.({ uploadId, error: errorMessage });
      reject(error);
    }
  });
}

/**
 * Cancel an ongoing upload
 */
export async function cancelUpload(uploadId: string): Promise<boolean> {
  try {
    await Upload.cancelUpload(uploadId);
    console.log(`🚫 Cancelled upload: ${uploadId}`);
    return true;
  } catch (error) {
    console.error('Failed to cancel upload:', error);
    return false;
  }
}

/**
 * Get file info for a given path
 */
export async function getFileInfo(path: string) {
  try {
    return await Upload.getFileInfo(path);
  } catch {
    return null;
  }
}
