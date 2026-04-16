import React, { useEffect, useRef } from 'react';
import {
  NativeModules,
  findNodeHandle,
  ViewStyle,
  View,
  Text,
  StyleSheet,
  Platform,
  requireNativeComponent,
  UIManager,
} from 'react-native';

/**
 * Event data for recording completed callback
 */
export interface RecordingCompletedEvent {
  nativeEvent: {
    filePath: string;    // Path to the recorded video file
    duration: number;    // Recording duration in seconds
    imuDataPath: string; // Path to the IMU JSON file (same location as video)
  };
}

/**
 * Event data for hand status change callback
 */
export interface HandStatusEvent {
  nativeEvent: {
    handCount: number;
    valid: boolean;
    handInFrame: boolean;
    handsFullyInFrame: boolean;
  };
}

/**
 * Event data for voice command callback
 */
export interface VoiceCommandEvent {
  nativeEvent: {
    command: string;
    accepted: boolean;
    reason?: string;
  };
}

/**
 * Event data for error callback
 */
export interface ErrorEvent {
  nativeEvent: {
    message: string;
  };
}

/**
 * Event data for clap detected callback
 */
export interface ClapDetectedEvent {
  nativeEvent: {
    accepted: boolean;
  };
}

interface HandCameraViewProps {
  style?: ViewStyle;
  isActive?: boolean;
  enableClapStart?: boolean;
  enableVoiceStart?: boolean;
  requireHandsForVoiceStart?: boolean;
  onHandStatusChange?: (event: HandStatusEvent) => void;
  onReady?: () => void;
  onError?: (event: ErrorEvent) => void;
  onRecordingStarted?: () => void;
  onRecordingPaused?: () => void;
  onRecordingResumed?: () => void;
  onRecordingCompleted?: (event: RecordingCompletedEvent) => void;
  onVoiceCommand?: (event: VoiceCommandEvent) => void;
  onClapDetected?: (event: ClapDetectedEvent) => void;
}

export interface HandCameraViewRef {
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  speakCue: (text: string) => void;
  stop: () => void;
  testBeep: () => void;
}

// Load native component - works with both Paper and Fabric (via interop layer)
let NativeHandCameraView: React.ComponentType<any> | null = null;

if (Platform.OS === 'ios' || Platform.OS === 'android') {
  try {
    NativeHandCameraView = requireNativeComponent('HandCameraView');
    console.log(`✅ NativeHandCameraView loaded (${Platform.OS})`);
  } catch (e) {
    console.warn('❌ HandCameraView not available:', e);
  }
}

export const HandCameraView = React.forwardRef<
  HandCameraViewRef,
  HandCameraViewProps
>(
  (
    {
      style,
      isActive = true,
      enableClapStart = false,
      enableVoiceStart = false,
      requireHandsForVoiceStart = true,
      onHandStatusChange,
      onReady,
      onError,
      onRecordingStarted,
      onRecordingPaused,
      onRecordingResumed,
      onRecordingCompleted,
      onVoiceCommand,
      onClapDetected,
    },
    ref,
  ) => {
    const viewRef = useRef<any>(null);
    const startedRef = useRef(false);
    const { HandCameraViewManager } = NativeModules;

    // Helper to dispatch commands to native view
    const dispatchCommand = (commandName: string, args: any[] = []) => {
      const nodeHandle = findNodeHandle(viewRef.current);
      if (!nodeHandle) {
        console.error(`❌ dispatchCommand(${commandName}): nodeHandle is null`);
        return;
      }

      if (Platform.OS === 'android') {
        // On Android, use UIManager.dispatchViewManagerCommand
        const commandId = UIManager.getViewManagerConfig?.('HandCameraView')?.Commands?.[commandName];
        if (commandId !== undefined) {
          console.log(`📤 Dispatching command ${commandName} (id: ${commandId}) to Android view ${nodeHandle}`);
          UIManager.dispatchViewManagerCommand(nodeHandle, commandId, args);
        } else {
          console.error(`❌ Command ${commandName} not found in HandCameraView commands`);
        }
      } else if (HandCameraViewManager) {
        // On iOS, use direct native module method call
        const method = HandCameraViewManager[commandName];
        if (typeof method === 'function') {
          method(nodeHandle, ...args);
        } else {
          console.error(`❌ Method ${commandName} not found on HandCameraViewManager`);
        }
      } else {
        console.error('❌ HandCameraViewManager not available');
      }
    };

    // Expose recording methods via ref
    React.useImperativeHandle(ref, () => ({
      startRecording: () => {
        console.log('📹 HandCameraView.startRecording() called');
        dispatchCommand('startRecording');
      },
      pauseRecording: () => {
        console.log('⏸️ HandCameraView.pauseRecording() called');
        dispatchCommand('pauseRecording');
      },
      resumeRecording: () => {
        console.log('▶️ HandCameraView.resumeRecording() called');
        dispatchCommand('resumeRecording');
      },
      stopRecording: () => {
        console.log('⏹️ HandCameraView.stopRecording() called');
        dispatchCommand('stopRecording');
      },
      speakCue: (text: string) => {
        dispatchCommand('speakCue', [text]);
      },
      stop: () => {
        // Explicitly stop the camera - clears all native callbacks immediately
        // This is critical for preventing crashes when the component is about to unmount
        const nodeHandle = findNodeHandle(viewRef.current);
        if (nodeHandle && HandCameraViewManager) {
          console.log('🛑 HandCameraView.stop() called explicitly');
          HandCameraViewManager.stop(nodeHandle);
          startedRef.current = false;
        }
      },
      testBeep: () => {
        // Test beep sound and vibration - call this before recording to verify hardware works
        const nodeHandle = findNodeHandle(viewRef.current);
        if (nodeHandle && HandCameraViewManager) {
          console.log('🧪 Testing beep sound and vibration...');
          HandCameraViewManager.testBeep(nodeHandle);
        }
      },
    }));

    // Handle isActive prop - start/stop camera
    // On Android, the isActive prop is passed directly to native view
    // On iOS, we need to call start/stop methods directly
    useEffect(() => {
      if (!NativeHandCameraView) {
        return;
      }

      // For iOS, still use direct method calls
      if (Platform.OS === 'ios') {
        if (isActive && !startedRef.current) {
          const timer = setTimeout(() => {
            const nodeHandle = findNodeHandle(viewRef.current);
            if (nodeHandle && viewRef.current && HandCameraViewManager) {
              startedRef.current = true;
              console.log('🎬 Starting HandCameraView (iOS)');
              HandCameraViewManager.start(nodeHandle);
            }
          }, 300);

          return () => clearTimeout(timer);
        } else if (!isActive && startedRef.current) {
          const nodeHandle = findNodeHandle(viewRef.current);
          if (nodeHandle && HandCameraViewManager) {
            console.log('🛑 Stopping HandCameraView (iOS)');
            HandCameraViewManager.stop(nodeHandle);
            startedRef.current = false;
          }
        }
      } else {
        // On Android, the isActive prop is passed directly to native view
        // Just track the state for consistency
        if (isActive && !startedRef.current) {
          startedRef.current = true;
          console.log('🎬 HandCameraView isActive=true (Android - handled by prop)');
        } else if (!isActive && startedRef.current) {
          startedRef.current = false;
          console.log('🛑 HandCameraView isActive=false (Android - handled by prop)');
        }
      }
    }, [isActive, HandCameraViewManager]);

    // Fallback if native not available
    if (!NativeHandCameraView) {
      return (
        <View style={[styles.fallback, style]}>
          <Text style={styles.fallbackText}>Camera not available</Text>
        </View>
      );
    }

    return (
      <NativeHandCameraView
        ref={viewRef}
        style={style}
        isActive={isActive}
        enableClapStart={enableClapStart}
        enableVoiceStart={enableVoiceStart}
        requireHandsForVoiceStart={requireHandsForVoiceStart}
        onHandStatusChange={onHandStatusChange}
        onReady={onReady}
        onError={onError}
        onRecordingStarted={onRecordingStarted}
        onRecordingPaused={onRecordingPaused}
        onRecordingResumed={onRecordingResumed}
        onRecordingCompleted={onRecordingCompleted}
        onVoiceCommand={onVoiceCommand}
        onClapDetected={onClapDetected}
      />
    );
  },
);

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#fff',
    fontSize: 16,
  },
});
