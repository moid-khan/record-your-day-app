import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRecordingStore } from '../state/useRecordingStore';
import { colors, spacing } from '../theme';

export function UploadProgressBar() {
  const insets = useSafeAreaInsets();
  const { upload, clearUpload } = useRecordingStore();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(upload.progress / 100, { duration: 300 });
  }, [upload.progress]);

  // Auto-hide after completion
  useEffect(() => {
    if (upload.status === 'completed') {
      const timer = setTimeout(() => {
        clearUpload();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [upload.status, clearUpload]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  if (upload.status === 'idle') {
    return null;
  }

  const getStatusIcon = () => {
    switch (upload.status) {
      case 'uploading':
        return 'upload-cloud';
      case 'completed':
        return 'check-circle';
      case 'failed':
        return 'alert-circle';
      default:
        return 'upload-cloud';
    }
  };

  const getStatusColor = () => {
    switch (upload.status) {
      case 'uploading':
        return colors.primary;
      case 'completed':
        return '#27ae60';
      case 'failed':
        return colors.warning;
      default:
        return colors.primary;
    }
  };

  const getStatusText = () => {
    switch (upload.status) {
      case 'uploading':
        return `Uploading... ${upload.progress}%`;
      case 'completed':
        return 'Upload complete!';
      case 'failed':
        return upload.error || 'Upload failed';
      default:
        return '';
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { top: insets.top + spacing.sm }]}
    >
      <View style={styles.content}>
        <Icon name={getStatusIcon()} size={20} color={getStatusColor()} />
        <View style={styles.textContainer}>
          <Text style={styles.statusText} numberOfLines={1}>
            {getStatusText()}
          </Text>
          {upload.fileName ? (
            <Text style={styles.fileName} numberOfLines={1}>
              {upload.fileName}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={clearUpload} hitSlop={10}>
          <Icon name="x" size={18} color={colors.subduedText} />
        </Pressable>
      </View>
      {upload.status === 'uploading' && (
        <View style={styles.progressContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              { backgroundColor: getStatusColor() },
              progressStyle,
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  fileName: {
    fontSize: 12,
    color: colors.subduedText,
    marginTop: 2,
  },
  progressContainer: {
    height: 3,
    backgroundColor: colors.border,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
});
