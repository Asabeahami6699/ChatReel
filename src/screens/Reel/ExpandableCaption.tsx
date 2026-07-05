import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  text: string;
  style?: object;
  maxLines?: number;
};

export function ExpandableCaption({ text, style, maxLines = 2 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (text.length > maxLines * 42) setTruncated(true);
  }, [text, maxLines]);

  if (!text.trim()) return null;

  return (
    <View>
      <View style={styles.measureWrap} pointerEvents="none">
        <Text
          style={[styles.caption, style]}
          onTextLayout={(e) => {
            setTruncated(e.nativeEvent.lines.length > maxLines);
          }}
        >
          {text}
        </Text>
      </View>

      <View style={styles.row}>
        <Text
          style={[styles.caption, style, styles.captionBody]}
          numberOfLines={expanded ? undefined : maxLines}
          ellipsizeMode="tail"
        >
          {text}
        </Text>
        {truncated && !expanded ? (
          <TouchableOpacity onPress={() => setExpanded(true)} hitSlop={{ top: 6, bottom: 6, left: 2, right: 6 }}>
            <Text style={styles.action}>more</Text>
          </TouchableOpacity>
        ) : null}
        {expanded && truncated ? (
          <TouchableOpacity onPress={() => setExpanded(false)} hitSlop={{ top: 6, bottom: 6, left: 2, right: 6 }}>
            <Text style={styles.action}>hide</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  measureWrap: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: -1,
    pointerEvents: 'none',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-end',
  },
  caption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  captionBody: {
    flexShrink: 1,
    flexGrow: 0,
    maxWidth: '88%',
  },
  action: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 19,
    marginLeft: 2,
    marginBottom: 1,
  },
});
