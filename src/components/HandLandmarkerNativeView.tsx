import { requireNativeComponent, ViewStyle } from 'react-native';

interface HandLandmarkerCameraViewProps {
  style?: ViewStyle;
  isActive?: boolean;
  confidenceThresholds?: number[]; // [detection, tracking, presence]
  onHandsDetected?: (event: {
    nativeEvent: { handsDetected: number; timestamp: number };
  }) => void;
  onError?: (event: {
    nativeEvent: { error: string; timestamp: number };
  }) => void;
  onReady?: () => void;
}

// Use the new direct view implementation that doesn't use Fragments
const HandLandmarkerCameraView =
  requireNativeComponent<HandLandmarkerCameraViewProps>(
    'HandLandmarkerDirectView',
  );

export default HandLandmarkerCameraView;
