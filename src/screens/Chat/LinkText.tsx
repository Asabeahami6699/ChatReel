import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { splitTextWithLinks } from './chatMessageUtils';
import { chatTheme } from './chatTheme';

type Props = {
  text: string;
  color: string;
  linkColor?: string;
  onLinkPress?: (url: string) => void;
};

export function LinkText({ text, color, linkColor = chatTheme.link, onLinkPress }: Props) {
  const segments = splitTextWithLinks(text);

  return (
    <Text style={[styles.text, { color }]}>
      {segments.map((seg, i) =>
        seg.type === 'link' ? (
          <Text
            key={i}
            style={[styles.link, { color: linkColor }]}
            onPress={() => onLinkPress?.(seg.value)}
          >
            {seg.value}
          </Text>
        ) : seg.type === 'mention' ? (
          <Text key={i} style={[styles.mention, { color: linkColor }]}>
            {seg.value}
          </Text>
        ) : (
          <Text key={i}>{seg.value}</Text>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 22 },
  link: { textDecorationLine: 'underline' },
  mention: { fontWeight: '700' },
});
