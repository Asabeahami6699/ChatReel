// D:\chatApp\chatApp\src\components\chatscreen\MessageInput.tsx
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export const MessageInput = ({ onSend, disabled }: { onSend: any; disabled: boolean }) => {
  const [text, setText] = useState('');

  const pickFile = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      onSend(text.trim(), {
        uri: asset.uri,
        type: asset.type || asset.mimeType,
        name: asset.fileName || 'file',
      });
      setText('');
    }
  };

  const send = () => {
    if (text.trim()) {
      onSend(text.trim());
      setText('');
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={pickFile} disabled={disabled}>
        <Text style={styles.attach}>Attach</Text>
      </TouchableOpacity>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Type a message..."
        style={styles.input}
        editable={!disabled}
        onSubmitEditing={send}
      />
      <TouchableOpacity onPress={send} disabled={disabled || !text.trim()}>
        <Text style={[styles.send, (!text.trim() || disabled) && styles.sendDisabled]}>Send</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  attach: { fontSize: 24, marginHorizontal: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  send: { color: '#007AFF', fontWeight: '600', marginRight: 8 },
  sendDisabled: { color: '#ccc' },
});