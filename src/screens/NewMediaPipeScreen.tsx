import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  StatusBar,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HandLandmarkerCameraView from '../components/HandLandmarkerNativeView';

const { HandLandmarkerModule } = NativeModules;

const NewMediaPipeScreen: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [handsDetected, setHandsDetected] = useState(0);
  const [moduleStatus, setModuleStatus] = useState('Initializing...');

  const handleStartRecording = useCallback(() => {
    setIsRecording(true);
    Alert.alert('Recording Started', 'MediaPipe hand detection is now active');
  }, []);

  const handleStopRecording = useCallback(() => {
    setIsRecording(false);
    Alert.alert(
      'Recording Stopped',
      `Session completed. Hands detected: ${handsDetected}`,
    );
  }, [handsDetected]);

  const handleHandsDetected = useCallback(
    (event: { nativeEvent: { handsDetected: number } }) => {
      setHandsDetected(event.nativeEvent.handsDetected);
    },
    [],
  );

  const handleError = useCallback(
    (event: { nativeEvent: { error: string } }) => {
      console.error('MediaPipe Error:', event.nativeEvent.error);
      setModuleStatus(`Error: ${event.nativeEvent.error}`);
      Alert.alert('MediaPipe Error', event.nativeEvent.error);
    },
    [],
  );

  // Test native module on mount
  useEffect(() => {
    const testNativeModule = async () => {
      try {
        if (HandLandmarkerModule) {
          console.log('HandLandmarkerModule found:', HandLandmarkerModule);
          await HandLandmarkerModule.initializeHandLandmarker();
          setModuleStatus('Ready');
        } else {
          setModuleStatus('Module Not Found');
        }
      } catch (error) {
        console.error('Native module test failed:', error);
        setModuleStatus(`Error: ${error}`);
      }
    };

    testNativeModule();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* MediaPipe Camera View */}
      <View style={styles.cameraContainer}>
        <HandLandmarkerCameraView
          style={styles.camera}
          isActive={isRecording}
          confidenceThresholds={[0.5, 0.5, 0.5]}
          onHandsDetected={handleHandsDetected}
          onError={handleError}
        />

        {/* Status Overlay */}
        <View style={styles.statusOverlay}>
          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Status: {moduleStatus}</Text>
            <Text style={styles.statusLabel}>Hands: {handsDetected}</Text>
          </View>
        </View>
      </View>

      {/* Simple Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording
              ? styles.recordButtonActive
              : styles.recordButtonInactive,
          ]}
          onPress={isRecording ? handleStopRecording : handleStartRecording}
        >
          <Text style={styles.recordButtonText}>
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.statusText}>
          {isRecording
            ? '● Recording with MediaPipe Hand Tracking'
            : 'Ready to Record'}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  statusOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    pointerEvents: 'none',
  },
  statusBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 16,
    borderRadius: 8,
  },
  statusLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  controls: {
    backgroundColor: '#000',
    paddingHorizontal: 20,
    paddingVertical: 30,
    alignItems: 'center',
  },
  recordButton: {
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    marginBottom: 20,
  },
  recordButtonInactive: {
    backgroundColor: '#ff4444',
  },
  recordButtonActive: {
    backgroundColor: '#666',
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default NewMediaPipeScreen;
