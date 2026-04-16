import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useIsFocused } from '@react-navigation/native';
import { NativeEventEmitter } from 'react-native';

interface VisionCameraHandViewProps {
  onHandStatusChange?: (event: {
    handCount: number;
    handInFrame: boolean;
  }) => void;
  onReady?: () => void;
  onError?: (error: string) => void;
}

export function VisionCameraHandView({
  onHandStatusChange,
  onReady,
  onError,
}: VisionCameraHandViewProps) {
  const device = useCameraDevice('front');
  const isFocused = useIsFocused();
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    // Request camera permission
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        onReady?.();
      } else {
        onError?.('Camera permission denied');
      }
    })();
  }, [onReady, onError]);

  // Listen for hand detection events from native
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const eventEmitter = new NativeEventEmitter();
    const subscription = eventEmitter.addListener('onHandDetected', event => {
      onHandStatusChange?.({
        handCount: event.handCount,
        handInFrame: event.handInFrame,
      });
    });

    return () => {
      subscription.remove();
    };
  }, [onHandStatusChange]);

  if (!device || !hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>
          {!hasPermission ? 'Camera permission required' : 'Loading camera...'}
        </Text>
      </View>
    );
  }

  // Just use VisionCamera without frame processor
  // Hand detection will be done natively by hooking into VisionCamera's camera
  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={isFocused && Platform.OS === 'android'}
      // NO frameProcessor - we'll hook into the native camera directly
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 16,
  },
});
