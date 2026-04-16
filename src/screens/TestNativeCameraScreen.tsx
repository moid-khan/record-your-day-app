import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { NativeHandCamera } from '../components/NativeHandCamera';

/**
 * Test screen for native camera with MediaPipe hand detection.
 * This demonstrates the full-screen native Activity approach (matches iOS).
 */
export function TestNativeCameraScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [lastResult, setLastResult] = useState<{
    filePath: string;
    duration: number;
  } | null>(null);

  const handleStartRecording = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Error', 'Native camera is only available on Android');
      return;
    }

    try {
      setIsRecording(true);

      // Start recording for 60 seconds
      const result = await NativeHandCamera.startRecording(60);

      setLastResult(result);
      Alert.alert(
        'Recording Complete',
        `Video saved to: ${
          result.filePath
        }\nDuration: ${result.duration.toFixed(1)}s`,
      );
    } catch (error: any) {
      console.error('Recording error:', error);
      Alert.alert('Recording Error', error.message || 'Unknown error');
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Native Camera Test</Text>
      <Text style={styles.subtitle}>
        Full-screen native Activity with MediaPipe hand detection
      </Text>

      <TouchableOpacity
        style={[styles.button, isRecording && styles.buttonDisabled]}
        onPress={handleStartRecording}
        disabled={isRecording}
      >
        <Text style={styles.buttonText}>
          {isRecording ? 'Recording...' : 'Start Recording (60s)'}
        </Text>
      </TouchableOpacity>

      {lastResult && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Last Recording:</Text>
          <Text style={styles.resultText}>
            Duration: {lastResult.duration.toFixed(1)}s
          </Text>
          <Text style={styles.resultText} numberOfLines={2}>
            Path: {lastResult.filePath}
          </Text>
        </View>
      )}

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>How it works:</Text>
        <Text style={styles.infoText}>
          • Launches full-screen native Android Activity
        </Text>
        <Text style={styles.infoText}>
          • Uses MediaPipe's proven camera implementation
        </Text>
        <Text style={styles.infoText}>
          • Hand detection runs on native side
        </Text>
        <Text style={styles.infoText}>• Records video with audio</Text>
        <Text style={styles.infoText}>• Returns video file path when done</Text>
        <Text style={styles.infoText}>
          • Matches iOS implementation pattern
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
  },
  buttonDisabled: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 8,
    marginBottom: 30,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  resultText: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 5,
  },
  infoContainer: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 5,
  },
});
