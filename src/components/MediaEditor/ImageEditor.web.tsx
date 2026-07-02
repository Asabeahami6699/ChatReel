// Web: react-native-image-crop-picker requires native TurboModules (not available on web).
import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';

interface ImageEditorProps {
  source: { uri: string };
  onSave: (croppedUri: string) => void;
  onCancel: () => void;
  aspectRatio?: 'free' | '1:1' | '4:3' | '16:9';
}

const ImageEditor: React.FC<ImageEditorProps> = ({ source, onSave, onCancel }) => {
  return (
    <View style={styles.container}>
      <Image source={source} style={styles.image} resizeMode="contain" />
      <View style={styles.footer}>
        <Text style={styles.hint}>
          Advanced cropping is only available in the Android/iOS app. On web you can use the
          image as-is.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => onSave(source.uri)}>
          <Text style={styles.primaryText}>Use image</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  footer: {
    padding: 20,
    gap: 12,
    backgroundColor: '#111',
  },
  hint: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: '#0b62ff',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff3b3b',
  },
  secondaryText: {
    color: '#ff3b3b',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ImageEditor;
