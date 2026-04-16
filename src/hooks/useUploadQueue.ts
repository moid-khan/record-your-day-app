/**
 * Hook for accessing the upload queue state and actions
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getPendingUploads,
  getQueueStats,
  subscribeToQueueChanges,
  subscribeToProgress,
  subscribeToStatus,
  queueUpload,
  removeFromQueue,
  retryUpload,
  retryAllFailed,
  processQueue,
  isConnected,
  isOnWifi,
  getCurrentNetworkState,
  type QueuedUpload,
  type UploadStatus,
} from '../lib/uploadQueue';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type QueueStats = {
  total: number;
  pending: number;
  uploading: number;
  completed: number;
  failed: number;
};

export function useUploadQueue() {
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [stats, setStats] = useState<QueueStats>(getQueueStats());
  const [networkState, setNetworkState] = useState<NetInfoState | null>(getCurrentNetworkState());

  // Subscribe to queue changes
  useEffect(() => {
    // Initial load
    setQueue(getPendingUploads());
    setStats(getQueueStats());

    // Subscribe to changes
    const unsubQueue = subscribeToQueueChanges((newQueue) => {
      setQueue(newQueue);
      setStats(getQueueStats());
    });

    const unsubProgress = subscribeToProgress((id, progress) => {
      setQueue(prev => prev.map(item =>
        item.id === id ? { ...item, progress } : item
      ));
    });

    const unsubStatus = subscribeToStatus((id, status, error) => {
      setQueue(prev => prev.map(item =>
        item.id === id ? { ...item, status, error } : item
      ));
      setStats(getQueueStats());
    });

    // Subscribe to network changes
    const unsubNetwork = NetInfo.addEventListener(state => {
      setNetworkState(state);
    });

    return () => {
      unsubQueue();
      unsubProgress();
      unsubStatus();
      unsubNetwork();
    };
  }, []);

  const addToQueue = useCallback((params: Parameters<typeof queueUpload>[0]) => {
    return queueUpload(params);
  }, []);

  const remove = useCallback((id: string) => {
    return removeFromQueue(id);
  }, []);

  const retry = useCallback((id: string) => {
    retryUpload(id);
  }, []);

  const retryAll = useCallback(() => {
    retryAllFailed();
  }, []);

  const process = useCallback(() => {
    processQueue();
  }, []);

  return {
    // Queue state
    queue,
    stats,
    // Network state
    networkState,
    isConnected: networkState?.isConnected ?? false,
    isWifi: networkState?.type === 'wifi',
    // Actions
    addToQueue,
    remove,
    retry,
    retryAll,
    processQueue: process,
  };
}

/**
 * Hook for network status only
 */
export function useNetworkStatus() {
  const [networkState, setNetworkState] = useState<NetInfoState | null>(null);

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then(setNetworkState);

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener(setNetworkState);
    return unsubscribe;
  }, []);

  return {
    networkState,
    isConnected: networkState?.isConnected ?? false,
    isWifi: networkState?.type === 'wifi',
    connectionType: networkState?.type ?? 'unknown',
  };
}
