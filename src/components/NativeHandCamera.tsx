import { NativeModules, Platform } from 'react-native';

const { HandLandmarkerModule } = NativeModules;

export interface RecordingResult {
  filePath: string;
  duration: number; // in seconds
}

/**
 * Native camera recording with MediaPipe hand detection.
 * This launches a full-screen native Activity on Android (matches iOS pattern).
 *
 * Usage:
 * ```tsx
 * import { NativeHandCamera } from './components/NativeHandCamera';
 *
 * const result = await NativeHandCamera.startRecording(60); // 60 seconds
 * console.log('Video saved to:', result.filePath);
 * ```
 */
export const NativeHandCamera = {
  /**
   * Start recording with hand detection.
   * Opens a full-screen native camera Activity.
   *
   * @param durationSeconds - Maximum recording duration in seconds
   * @returns Promise with video file path and actual duration
   */
  startRecording: async (durationSeconds: number): Promise<RecordingResult> => {
    if (Platform.OS !== 'android') {
      throw new Error('NativeHandCamera is only available on Android');
    }

    if (!HandLandmarkerModule) {
      throw new Error(
        'HandLandmarkerModule not found. Make sure native module is linked.',
      );
    }

    try {
      const result = await HandLandmarkerModule.startRecording(durationSeconds);
      return result;
    } catch (error) {
      console.error('Recording error:', error);
      throw error;
    }
  },

  /**
   * Check if camera is available
   */
  checkAvailability: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }

    if (!HandLandmarkerModule) {
      return false;
    }

    try {
      return await HandLandmarkerModule.checkCameraAvailability();
    } catch (error) {
      console.error('Camera availability check error:', error);
      return false;
    }
  },
};
