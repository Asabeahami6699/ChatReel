// Native only — web uses ImageEditor.web.tsx (no react-native-image-crop-picker on web).
import React, { useState, useEffect } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  ActivityIndicator,
} from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface ImageEditorProps {
  source: { uri: string };
  onSave: (croppedUri: string) => void;
  onCancel: () => void;
  aspectRatio?: 'free' | '1:1' | '4:3' | '16:9';
}

const ImageEditor: React.FC<ImageEditorProps> = ({ 
  source, onSave, onCancel, aspectRatio = 'free' 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert aspect ratio string to width/height
  const getCropDimensions = () => {
    switch (aspectRatio) {
      case '1:1':
        return { width: 1080, height: 1080 };
      case '4:3':
        return { width: 1200, height: 900 };
      case '16:9':
        return { width: 1280, height: 720 };
      default:
        return { width: 1080, height: 1080 }; // Default square
    }
  };

  const openNativeCropper = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const dimensions = getCropDimensions();
      
      const result = await ImagePicker.openCropper({
        path: source.uri,
        width: dimensions.width,
        height: dimensions.height,
        cropping: true,
        freeStyleCropEnabled: aspectRatio === 'free',
        
        // UI Customization
        cropperToolbarTitle: 'Edit Image',
        cropperActiveWidgetColor: '#0b62ff',
        cropperStatusBarColor: '#000000',
        cropperToolbarColor: '#000000',
        cropperToolbarWidgetColor: '#ffffff',
        showCropGuidelines: true,
        showCropFrame: true,
        hideBottomControls: false,
        enableRotationGesture: true,
        
        // iOS specific
        cropperChooseText: 'Save',
        cropperCancelText: 'Cancel',
        cropperChooseColor: '#0b62ff',
        cropperCancelColor: '#ffffff',
        
        // Compression
        compressImageQuality: 0.8,
        compressImageMaxWidth: 1920,
        compressImageMaxHeight: 1920,
        
        // Format
        mediaType: 'photo',
        forceJpg: true,
      });
      
      console.log('✅ Crop successful:', result.path);
      onSave(result.path);
    } catch (error: any) {
      console.log('❌ Crop cancelled or failed:', error);
      
      if (error?.code === 'E_PICKER_CANCELLED') {
        // User cancelled
        onCancel();
      } else {
        // Actual error
        setError(error?.message || 'Failed to crop image');
        // Fallback to original image
        onSave(source.uri);
      }
    } finally {
      setLoading(false);
    }
  };

  // Automatically open the cropper when component mounts
  useEffect(() => {
    openNativeCropper();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0b62ff" />
          <Text style={styles.loadingText}>Opening editor...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={openNativeCropper}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show a preview while loading
  return (
    <View style={styles.container}>
      <Image source={source} style={styles.image} resizeMode="contain" />
      <View style={styles.overlay}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.overlayText}>Preparing editor...</Text>
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
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  errorTitle: {
    color: '#ff3b3b',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorMessage: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#0b62ff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 59, 59, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff3b3b',
  },
  cancelButtonText: {
    color: '#ff3b3b',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ImageEditor;