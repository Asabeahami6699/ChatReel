import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  undo: () => void;
  redo: () => void;
  color: string;
  setColor: (c: string) => void;
  inc: () => void;
  dec: () => void;
};

export default function DrawingToolbar({
  undo,
  redo,
  color,
  setColor,
  inc,
  dec,
}: Props) {
  return (
    <View
      style={{
        position: 'absolute',
        right: 16,
        top: 80,
        gap: 18,
      }}
    >
      <TouchableOpacity onPress={undo}>
        <Ionicons name="arrow-undo" size={22} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity onPress={redo}>
        <Ionicons name="arrow-redo" size={22} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setColor(color === '#ff3b3b' ? '#00ffd0' : '#ff3b3b')}>
        <Ionicons name="color-palette" size={22} color={color} />
      </TouchableOpacity>

      <TouchableOpacity onPress={inc}>
        <Ionicons name="add" size={22} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity onPress={dec}>
        <Ionicons name="remove" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
