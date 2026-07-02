import React, { useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useDrawingState } from './useDrawingState';

type Props = {
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  drawing: ReturnType<typeof useDrawingState>;
};

export default function SimpleDrawingCanvas({
  width,
  height,
  color,
  strokeWidth,
  drawing,
}: Props) {
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrentStroke({
        points: [{ x: locationX, y: locationY }],
        color,
        width: strokeWidth,
      });
    },
    onPanResponderMove: (e) => {
      if (!currentStroke) return;
      const { locationX, locationY } = e.nativeEvent;
      setCurrentStroke({
        ...currentStroke,
        points: [...currentStroke.points, { x: locationX, y: locationY }],
      });
    },
    onPanResponderRelease: () => {
      if (currentStroke && currentStroke.points.length > 1) {
        drawing.addStroke(currentStroke);
      }
      setCurrentStroke(null);
    },
    onPanResponderTerminate: () => {
      setCurrentStroke(null);
    },
  });

  const pointsToPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return '';
    const first = points[0];
    let path = `M ${first.x},${first.y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x},${points[i].y}`;
    }
    return path;
  };

  return (
    <View
      style={[styles.container, { width, height }]}
      {...panResponder.panHandlers}
    >
      <Svg style={StyleSheet.absoluteFill}>
        {/* Render saved strokes */}
        {drawing.strokes.map((stroke, index) => (
          <Path
            key={`saved-${index}`}
            d={pointsToPath(stroke.points)}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        
        {/* Render current stroke */}
        {currentStroke && currentStroke.points.length > 1 && (
          <Path
            key="current"
            d={pointsToPath(currentStroke.points)}
            stroke={currentStroke.color}
            strokeWidth={currentStroke.width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
});