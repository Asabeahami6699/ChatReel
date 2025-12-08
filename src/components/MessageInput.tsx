import React, { forwardRef } from 'react';
import { TextInput, View, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  textInputWrapper: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
    marginHorizontal: 8,
    justifyContent: 'flex-end',
  },
  textArea: { fontSize: 16, color: '#000', padding: 0, minHeight: 20, maxHeight: 84 },
});

type MessageInputProps = {
  value: string;
  onChangeText: (text: string) => void;
};

const MessageInput = forwardRef<TextInput, MessageInputProps>((props, ref) => {
  return (
    <View style={styles.textInputWrapper}>
      <TextInput
        ref={ref}
        placeholder="Message"
        value={props.value}
        onChangeText={props.onChangeText}
        multiline
        style={styles.textArea}
        placeholderTextColor="#999"
      />
    </View>
  );
});

export default MessageInput;