import { useState } from 'react';
import type { HandBox, HandDetectorState } from '../types';

type UseHandDetectorParams = {
  enabled?: boolean;
  modelSource?: string;
  delegate?: string;
  marginRatio?: number;
  smoothingWindow?: number;
  onDetections?: (detections: HandBox[]) => void;
};

/**
 * DEPRECATED: This hook was for VisionCamera + TFLite.
 * Native hand detection is now handled by HandCameraView on iOS.
 * This stub is kept for backwards compatibility.
 */
export function useHandDetector(_params: UseHandDetectorParams): {
  state: HandDetectorState;
  frameProcessor?: undefined;
} {
  const [state] = useState<HandDetectorState>({
    status: 'idle',
        detections: [],
  });

  return { state, frameProcessor: undefined };
}
