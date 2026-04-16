/**
 * OfflineUploadBanner
 *
 * Shows a banner when there are pending uploads waiting for network
 * or failed uploads that need attention.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { colors } from '../theme';
import { scaleFont } from '../theme/scale';

export function OfflineUploadBanner() {
  const { stats, isConnected, isWifi, retryAll, processQueue } = useUploadQueue();

  // Don't show if no pending/failed uploads
  if (stats.pending === 0 && stats.failed === 0 && stats.uploading === 0) {
    return null;
  }

  const getStatusMessage = () => {
    if (stats.uploading > 0) {
      return `Uploading ${stats.uploading} recording${stats.uploading > 1 ? 's' : ''}...`;
    }

    if (!isConnected) {
      return `${stats.pending + stats.failed} recording${stats.pending + stats.failed > 1 ? 's' : ''} waiting for network`;
    }

    if (stats.failed > 0) {
      return `${stats.failed} upload${stats.failed > 1 ? 's' : ''} failed`;
    }

    if (stats.pending > 0) {
      return `${stats.pending} recording${stats.pending > 1 ? 's' : ''} queued`;
    }

    return '';
  };

  const getIcon = () => {
    if (stats.uploading > 0) return 'upload-cloud';
    if (!isConnected) return 'wifi-off';
    if (stats.failed > 0) return 'alert-circle';
    return 'clock';
  };

  const getBackgroundColor = () => {
    if (stats.uploading > 0) return colors.primary;
    if (!isConnected) return '#FF9500'; // Orange for offline
    if (stats.failed > 0) return '#FF3B30'; // Red for failed
    return colors.primary;
  };

  const handlePress = () => {
    if (stats.failed > 0) {
      retryAll();
    } else if (stats.pending > 0 && isConnected) {
      processQueue();
    }
  };

  const showAction = (stats.failed > 0 || (stats.pending > 0 && isConnected)) && stats.uploading === 0;

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: getBackgroundColor() }]}
      onPress={handlePress}
      disabled={!showAction}
      activeOpacity={showAction ? 0.8 : 1}
    >
      <View style={styles.content}>
        <Icon name={getIcon()} size={18} color="#FFFFFF" style={styles.icon} />
        <Text style={styles.message}>{getStatusMessage()}</Text>
        {showAction && (
          <View style={styles.action}>
            <Text style={styles.actionText}>
              {stats.failed > 0 ? 'Retry' : 'Upload'}
            </Text>
            <Icon name="chevron-right" size={16} color="#FFFFFF" />
          </View>
        )}
      </View>
      {stats.uploading > 0 && (
        <View style={styles.progressContainer}>
          <Animated.View style={[styles.progressBar, { width: '60%' }]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * Compact version for showing in headers
 */
export function OfflineUploadIndicator() {
  const { stats, isConnected } = useUploadQueue();

  const pendingCount = stats.pending + stats.uploading;
  const hasIssues = stats.failed > 0 || (!isConnected && pendingCount > 0);

  if (pendingCount === 0 && stats.failed === 0) {
    return null;
  }

  return (
    <View style={[
      styles.indicator,
      { backgroundColor: hasIssues ? '#FF3B30' : colors.primary }
    ]}>
      <Icon
        name={stats.uploading > 0 ? 'upload-cloud' : (hasIssues ? 'alert-circle' : 'clock')}
        size={12}
        color="#FFFFFF"
      />
      <Text style={styles.indicatorText}>
        {pendingCount + stats.failed}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 10,
  },
  message: {
    flex: 1,
    fontSize: scaleFont(14),
    fontWeight: '500',
    color: '#FFFFFF',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 4,
  },
  progressContainer: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1.5,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 1.5,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  indicatorText: {
    fontSize: scaleFont(12),
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
