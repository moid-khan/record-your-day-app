/**
 * Upload Queue Manager
 *
 * Robust offline-first upload system that:
 * - Persists pending uploads to MMKV storage
 * - Automatically retries when network is restored
 * - Prioritizes WiFi connections for large files
 * - Supports exponential backoff for failed uploads
 * - Works on both iOS and Android
 */

import { createMMKV, type MMKV } from 'react-native-mmkv';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { uploadRecording, type UploadParams } from './backgroundUpload';

// Upload queue storage
let queueStorage: MMKV | null = null;

function getQueueStorage(): MMKV | null {
  if (queueStorage) return queueStorage;
  try {
    queueStorage = createMMKV({ id: 'upload-queue-storage' });
    return queueStorage;
  } catch (error) {
    console.warn('Failed to initialize upload queue storage:', error);
    return null;
  }
}

const STORAGE_KEYS = {
  PENDING_UPLOADS: 'pending_uploads',
  UPLOAD_SETTINGS: 'upload_settings',
} as const;

// Upload item status
export type UploadStatus =
  | 'pending' // Waiting to be uploaded
  | 'uploading' // Currently uploading
  | 'completed' // Successfully uploaded
  | 'failed'; // Failed (will retry)

// Queue item structure
export type QueuedUpload = {
  id: string;
  params: UploadParams;
  status: UploadStatus;
  createdAt: number;
  lastAttemptAt?: number;
  attemptCount: number;
  error?: string;
  progress?: number;
};

// Upload settings
export type UploadSettings = {
  wifiOnly: boolean; // Only upload on WiFi
  maxRetries: number; // Max retry attempts
  retryDelayMs: number; // Base delay for exponential backoff
};

const DEFAULT_SETTINGS: UploadSettings = {
  wifiOnly: false, // Upload on any connection by default
  maxRetries: 10, // Retry up to 10 times
  retryDelayMs: 5000, // Start with 5 second delay
};

// Event listeners
type QueueChangeListener = (queue: QueuedUpload[]) => void;
type UploadProgressListener = (id: string, progress: number) => void;
type UploadStatusListener = (id: string, status: UploadStatus, error?: string) => void;

const queueChangeListeners: Set<QueueChangeListener> = new Set();
const progressListeners: Set<UploadProgressListener> = new Set();
const statusListeners: Set<UploadStatusListener> = new Set();

// Queue state
let isProcessing = false;
let networkUnsubscribe: (() => void) | null = null;
let currentNetworkState: NetInfoState | null = null;

/**
 * Generate unique ID for queue items
 */
function generateId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all pending uploads from storage
 */
export function getPendingUploads(): QueuedUpload[] {
  try {
    const storage = getQueueStorage();
    if (!storage) return [];
    const json = storage.getString(STORAGE_KEYS.PENDING_UPLOADS);
    if (!json) return [];
    return JSON.parse(json) as QueuedUpload[];
  } catch (error) {
    console.warn('Failed to get pending uploads:', error);
    return [];
  }
}

/**
 * Save pending uploads to storage
 */
function savePendingUploads(uploads: QueuedUpload[]): void {
  try {
    const storage = getQueueStorage();
    if (storage) {
      storage.set(STORAGE_KEYS.PENDING_UPLOADS, JSON.stringify(uploads));
      // Notify listeners
      queueChangeListeners.forEach(listener => listener(uploads));
    }
  } catch (error) {
    console.warn('Failed to save pending uploads:', error);
  }
}

/**
 * Get upload settings
 */
export function getUploadSettings(): UploadSettings {
  try {
    const storage = getQueueStorage();
    if (!storage) return DEFAULT_SETTINGS;
    const json = storage.getString(STORAGE_KEYS.UPLOAD_SETTINGS);
    if (!json) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
  } catch (error) {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save upload settings
 */
export function setUploadSettings(settings: Partial<UploadSettings>): void {
  try {
    const storage = getQueueStorage();
    if (storage) {
      const current = getUploadSettings();
      storage.set(STORAGE_KEYS.UPLOAD_SETTINGS, JSON.stringify({ ...current, ...settings }));
    }
  } catch (error) {
    console.warn('Failed to save upload settings:', error);
  }
}

/**
 * Add an upload to the queue
 * Returns the queue item ID
 */
export function queueUpload(params: UploadParams): string {
  const id = generateId();
  const item: QueuedUpload = {
    id,
    params,
    status: 'pending',
    createdAt: Date.now(),
    attemptCount: 0,
  };

  const uploads = getPendingUploads();
  uploads.push(item);
  savePendingUploads(uploads);

  console.log(`📤 Queued upload: ${id} (${params.title})`);

  // Try to process immediately if we have network
  processQueue();

  return id;
}

/**
 * Remove an upload from the queue
 */
export function removeFromQueue(id: string): boolean {
  const uploads = getPendingUploads();
  const index = uploads.findIndex(u => u.id === id);
  if (index === -1) return false;

  uploads.splice(index, 1);
  savePendingUploads(uploads);
  console.log(`🗑️ Removed upload from queue: ${id}`);
  return true;
}

/**
 * Update a queue item
 */
function updateQueueItem(id: string, updates: Partial<QueuedUpload>): void {
  const uploads = getPendingUploads();
  const index = uploads.findIndex(u => u.id === id);
  if (index === -1) return;

  uploads[index] = { ...uploads[index], ...updates };
  savePendingUploads(uploads);

  // Notify status listeners
  if (updates.status) {
    statusListeners.forEach(listener => listener(id, updates.status!, updates.error));
  }
}

/**
 * Check if we should upload based on network state
 */
function shouldUpload(networkState: NetInfoState | null): boolean {
  if (!networkState?.isConnected) {
    console.log('📵 No network connection');
    return false;
  }

  const settings = getUploadSettings();

  if (settings.wifiOnly && networkState.type !== 'wifi') {
    console.log('📶 WiFi-only mode enabled, waiting for WiFi...');
    return false;
  }

  return true;
}

/**
 * Calculate retry delay with exponential backoff
 */
function getRetryDelay(attemptCount: number): number {
  const settings = getUploadSettings();
  // Exponential backoff: 5s, 10s, 20s, 40s, etc. (max 5 minutes)
  const delay = Math.min(settings.retryDelayMs * Math.pow(2, attemptCount), 300000);
  return delay;
}

/**
 * Process a single upload
 */
async function processUpload(item: QueuedUpload): Promise<boolean> {
  console.log(`📤 Processing upload: ${item.id} (attempt ${item.attemptCount + 1})`);

  // Update status to uploading
  updateQueueItem(item.id, {
    status: 'uploading',
    lastAttemptAt: Date.now(),
    attemptCount: item.attemptCount + 1,
    error: undefined,
  });

  try {
    await uploadRecording(item.params, {
      onProgress: (data) => {
        updateQueueItem(item.id, { progress: data.progress });
        progressListeners.forEach(listener => listener(item.id, data.progress));
      },
      onCompleted: (data) => {
        if (data.responseCode >= 200 && data.responseCode < 300) {
          console.log(`✅ Upload completed: ${item.id}`);
          updateQueueItem(item.id, { status: 'completed', progress: 100 });
          // Remove from queue after successful upload
          setTimeout(() => removeFromQueue(item.id), 1000);
        } else {
          const error = `Server returned ${data.responseCode}`;
          console.error(`❌ Upload failed: ${item.id} - ${error}`);
          handleUploadFailure(item, error);
        }
      },
      onError: (data) => {
        console.error(`❌ Upload error: ${item.id} - ${data.error}`);
        handleUploadFailure(item, data.error);
      },
    });

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Upload exception: ${item.id} - ${errorMessage}`);
    handleUploadFailure(item, errorMessage);
    return false;
  }
}

/**
 * Handle upload failure
 */
function handleUploadFailure(item: QueuedUpload, error: string): void {
  const settings = getUploadSettings();
  const newAttemptCount = item.attemptCount + 1;

  if (newAttemptCount >= settings.maxRetries) {
    console.log(`⛔ Max retries reached for: ${item.id}`);
    updateQueueItem(item.id, {
      status: 'failed',
      error: `Max retries (${settings.maxRetries}) exceeded. Last error: ${error}`,
    });
  } else {
    const retryDelay = getRetryDelay(newAttemptCount);
    console.log(`⏳ Will retry ${item.id} in ${retryDelay / 1000}s (attempt ${newAttemptCount}/${settings.maxRetries})`);
    updateQueueItem(item.id, {
      status: 'pending',
      error,
      attemptCount: newAttemptCount,
    });

    // Schedule retry
    setTimeout(() => processQueue(), retryDelay);
  }
}

/**
 * Process the upload queue
 */
export async function processQueue(): Promise<void> {
  if (isProcessing) {
    console.log('📤 Queue already processing');
    return;
  }

  // Check network
  if (!shouldUpload(currentNetworkState)) {
    return;
  }

  const uploads = getPendingUploads();
  const pending = uploads.filter(u => u.status === 'pending');

  if (pending.length === 0) {
    console.log('📤 No pending uploads in queue');
    return;
  }

  console.log(`📤 Processing queue: ${pending.length} pending uploads`);
  isProcessing = true;

  try {
    // Process one at a time to avoid overwhelming the network
    for (const item of pending) {
      // Re-check network before each upload
      if (!shouldUpload(currentNetworkState)) {
        console.log('📵 Network lost, stopping queue processing');
        break;
      }

      await processUpload(item);

      // Small delay between uploads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Retry a specific failed upload
 */
export function retryUpload(id: string): void {
  const uploads = getPendingUploads();
  const item = uploads.find(u => u.id === id);
  if (!item) return;

  updateQueueItem(id, {
    status: 'pending',
    attemptCount: 0,
    error: undefined,
  });

  processQueue();
}

/**
 * Retry all failed uploads
 */
export function retryAllFailed(): void {
  const uploads = getPendingUploads();
  const failed = uploads.filter(u => u.status === 'failed');

  failed.forEach(item => {
    updateQueueItem(item.id, {
      status: 'pending',
      attemptCount: 0,
      error: undefined,
    });
  });

  if (failed.length > 0) {
    console.log(`🔄 Retrying ${failed.length} failed uploads`);
    processQueue();
  }
}

/**
 * Get queue statistics
 */
export function getQueueStats(): {
  total: number;
  pending: number;
  uploading: number;
  completed: number;
  failed: number;
} {
  const uploads = getPendingUploads();
  return {
    total: uploads.length,
    pending: uploads.filter(u => u.status === 'pending').length,
    uploading: uploads.filter(u => u.status === 'uploading').length,
    completed: uploads.filter(u => u.status === 'completed').length,
    failed: uploads.filter(u => u.status === 'failed').length,
  };
}

/**
 * Handle network state change
 */
function handleNetworkChange(state: NetInfoState): void {
  const wasConnected = currentNetworkState?.isConnected;
  const isNowConnected = state.isConnected;
  const wasWifi = currentNetworkState?.type === 'wifi';
  const isNowWifi = state.type === 'wifi';

  currentNetworkState = state;

  console.log(`🌐 Network changed: ${state.type}, connected: ${state.isConnected}`);

  // Process queue if we just got connection or switched to WiFi
  if ((!wasConnected && isNowConnected) || (!wasWifi && isNowWifi)) {
    console.log('🌐 Network restored, processing queue...');
    // Small delay to ensure network is stable
    setTimeout(() => processQueue(), 2000);
  }
}

/**
 * Initialize the upload queue manager
 * Call this once at app startup
 */
export function initUploadQueue(): void {
  console.log('📤 Initializing upload queue manager...');

  // Get initial network state
  NetInfo.fetch().then(state => {
    currentNetworkState = state;
    console.log(`🌐 Initial network state: ${state.type}, connected: ${state.isConnected}`);

    // Process any pending uploads
    const stats = getQueueStats();
    if (stats.pending > 0) {
      console.log(`📤 Found ${stats.pending} pending uploads, processing...`);
      processQueue();
    }
  });

  // Subscribe to network changes
  networkUnsubscribe = NetInfo.addEventListener(handleNetworkChange);

  console.log('📤 Upload queue manager initialized');
}

/**
 * Cleanup the upload queue manager
 * Call this when app is terminating
 */
export function cleanupUploadQueue(): void {
  if (networkUnsubscribe) {
    networkUnsubscribe();
    networkUnsubscribe = null;
  }
}

/**
 * Subscribe to queue changes
 */
export function subscribeToQueueChanges(listener: QueueChangeListener): () => void {
  queueChangeListeners.add(listener);
  return () => queueChangeListeners.delete(listener);
}

/**
 * Subscribe to upload progress
 */
export function subscribeToProgress(listener: UploadProgressListener): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

/**
 * Subscribe to upload status changes
 */
export function subscribeToStatus(listener: UploadStatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/**
 * Clear completed uploads from storage
 */
export function clearCompletedUploads(): void {
  const uploads = getPendingUploads();
  const remaining = uploads.filter(u => u.status !== 'completed');
  savePendingUploads(remaining);
}

/**
 * Get current network state
 */
export function getCurrentNetworkState(): NetInfoState | null {
  return currentNetworkState;
}

/**
 * Check if connected to WiFi
 */
export function isOnWifi(): boolean {
  return currentNetworkState?.type === 'wifi' && currentNetworkState?.isConnected === true;
}

/**
 * Check if connected to any network
 */
export function isConnected(): boolean {
  return currentNetworkState?.isConnected === true;
}
