import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

type Props = {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
};

/** Circular determinate progress ring (0–100). */
export function CircularProgressRing({
  progress,
  size = 72,
  strokeWidth = 3,
  color = '#007AFF',
  trackColor = 'rgba(0,0,0,0.18)',
  children,
}: Props) {
  const pct = Math.max(0, Math.min(100, progress)) / 100;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function CircularProgressPercent({
  progress,
  size = 44,
  color = '#007AFF',
}: {
  progress: number;
  size?: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <CircularProgressRing progress={pct} size={size} color={color} strokeWidth={3}>
      <Text style={[styles.pct, { fontSize: size < 40 ? 9 : 11 }]}>{pct}%</Text>
    </CircularProgressRing>
  );
}

const styles = StyleSheet.create({
  pct: { color: '#fff', fontWeight: '800' },
});
