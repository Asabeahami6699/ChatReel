import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  text: string;
  style?: object;
  maxLines?: number;
  /** Caption area width in px (typically 70% of reel frame). */
  maxWidth?: number;
};

export function ExpandableCaption({ text, style, maxLines = 2, maxWidth }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    setExpanded(false);
    setTruncated(false);
  }, [text]);

  if (!text.trim()) return null;

  const widthStyle = maxWidth != null ? { maxWidth, width: maxWidth } : styles.defaultWidth;

  return (
    <View style={widthStyle}>
      <View style={styles.measureWrap} pointerEvents="none">
        <Text
          style={[styles.caption, style, widthStyle]}
          onTextLayout={(e) => {
            setTruncated(e.nativeEvent.lines.length > maxLines);
          }}
        >
          {text}
        </Text>
      </View>

      <Text
        style={[styles.caption, style]}
        numberOfLines={expanded ? undefined : maxLines}
        ellipsizeMode="tail"
      >
        {text}
        {truncated && !expanded ? (
          <Text style={styles.action} onPress={() => setExpanded(true)}>
            {' '}
            more
          </Text>
        ) : null}
        {expanded && truncated ? (
          <Text style={styles.action} onPress={() => setExpanded(false)}>
            {' '}
            hide
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  defaultWidth: {
    maxWidth: '70%',
  },
  measureWrap: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    zIndex: -1,
    pointerEvents: 'none',
  },
  caption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  action: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 19,
  },
});
