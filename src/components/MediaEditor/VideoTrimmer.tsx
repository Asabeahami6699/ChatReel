import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

type Props = {
  duration?: number;
  onChange?: (start: number, end: number) => void;
};

export function VideoTrimmer({ duration = 0, onChange }: Props) {
  const safeDuration = Math.max(duration || 0, 1);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(safeDuration);

  useEffect(() => {
    setEnd(safeDuration);
  }, [safeDuration]);

  if (!duration || duration <= 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Trim</Text>
      <Text style={styles.hint}>Start {start.toFixed(1)}s</Text>
      <Slider
        minimumValue={0}
        maximumValue={safeDuration}
        value={start}
        minimumTrackTintColor="#0b62ff"
        maximumTrackTintColor="#555"
        thumbTintColor="#0b62ff"
        onValueChange={(v) => {
          const next = Math.min(v, end - 0.1);
          setStart(next);
          onChange?.(next, end);
        }}
      />
      <Text style={styles.hint}>End {end.toFixed(1)}s</Text>
      <Slider
        minimumValue={0}
        maximumValue={safeDuration}
        value={end}
        minimumTrackTintColor="#0b62ff"
        maximumTrackTintColor="#555"
        thumbTintColor="#0b62ff"
        onValueChange={(v) => {
          const next = Math.max(v, start + 0.1);
          setEnd(next);
          onChange?.(start, next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    padding: 12,
  },
  label: {
    color: '#fff',
    fontWeight: '600',
    marginBottom: 4,
  },
  hint: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 2,
  },
});

export default VideoTrimmer;
