import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { HandBox } from '../types';

type Props = {
  detections: HandBox[];
};

/**
 * Simple overlay that draws bounding boxes using absolute positioning.
 * Assumes the parent wraps a camera view and is positioned relative.
 */
export function DetectionOverlay({ detections }: Props) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {detections.map((det) => (
        <View
          key={det.id}
          style={[
            styles.box,
            {
              left: det.box.x,
              top: det.box.y,
              width: det.box.width,
              height: det.box.height,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#22c55e',
    borderRadius: 6,
  },
});
