import React from 'react';
import { Pressable, Text } from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
};

export default function Button({ label, onPress }: Props) {
  return (
    <Pressable onPress={onPress} className="bg-blue-500 p-3 rounded-xl">
      <Text className="text-white text-center">{label}</Text>
    </Pressable>
  );
}
