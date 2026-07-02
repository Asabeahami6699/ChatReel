// MediaEditor/exportEditedImage.ts - FIXED VERSION
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

export const exportEditedImage = async (
  originalUri: string,
  strokes: any[] = [],
  cropArea?: { x: number; y: number; width: number; height: number }
): Promise<string> => {
  try {
    let actions = [];
    
    // Apply crop if provided
    if (cropArea && cropArea.width > 0 && cropArea.height > 0) {
      actions.push({
        crop: {
          originX: cropArea.x,
          originY: cropArea.y,
          width: cropArea.width,
          height: cropArea.height,
        },
      });
    }
    
    const result = await ImageManipulator.manipulateAsync(
      originalUri,
      actions,
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    
    return result.uri;
  } catch (error) {
    console.error('Failed to export image:', error);
    throw error;
  }
};

// Helper function to get image dimensions
export const getImageDimensions = (uri: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        resolve({ width, height });
      },
      (error) => {
        reject(error);
      }
    );
  });
};

// ✅ FIXED: Accepts EITHER relative (0-1) OR absolute coordinates
export const cropImage = async (
  uri: string,
  crop: { 
    x: number;      // Relative (0-1) OR absolute pixels
    y: number;      // Relative (0-1) OR absolute pixels
    width: number;  // Relative (0-1) OR absolute pixels
    height: number; // Relative (0-1) OR absolute pixels
  },
  isRelative: boolean = true  // Default to relative coordinates
): Promise<string> => {
  try {
    console.log('🖼️ cropImage called with:', { crop, isRelative });
    
    let absoluteCrop;
    
    if (isRelative) {
      // Convert relative coordinates (0-1) to absolute pixels
      const { width: imgWidth, height: imgHeight } = await getImageDimensions(uri);
      
      console.log('📏 Original image dimensions:', { imgWidth, imgHeight });
      console.log('📐 Relative crop input:', crop);
      
      absoluteCrop = {
        originX: Math.round(crop.x * imgWidth),
        originY: Math.round(crop.y * imgHeight),
        width: Math.round(crop.width * imgWidth),
        height: Math.round(crop.height * imgHeight),
      };
      
      console.log('📍 Converted to absolute pixels:', absoluteCrop);
    } else {
      // Already in absolute pixels
      absoluteCrop = {
        originX: Math.round(crop.x),
        originY: Math.round(crop.y),
        width: Math.round(crop.width),
        height: Math.round(crop.height),
      };
    }
    
    // Validate crop area
    const { width: imgWidth, height: imgHeight } = await getImageDimensions(uri);
    
    // Clamp values to image bounds
    absoluteCrop.originX = Math.max(0, Math.min(imgWidth - 1, absoluteCrop.originX));
    absoluteCrop.originY = Math.max(0, Math.min(imgHeight - 1, absoluteCrop.originY));
    absoluteCrop.width = Math.max(1, Math.min(imgWidth - absoluteCrop.originX, absoluteCrop.width));
    absoluteCrop.height = Math.max(1, Math.min(imgHeight - absoluteCrop.originY, absoluteCrop.height));
    
    console.log('✅ Final crop area:', absoluteCrop);
    console.log('✅ Image bounds:', { imgWidth, imgHeight });
    
    // Perform the crop
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{
        crop: {
          originX: absoluteCrop.originX,
          originY: absoluteCrop.originY,
          width: absoluteCrop.width,
          height: absoluteCrop.height,
        }
      }],
      { 
        compress: 0.8, 
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false 
      }
    );
    
    console.log('🎉 Crop successful! Result URI:', result.uri.substring(0, 50) + '...');
    return result.uri;
  } catch (error) {
    console.error('❌ Failed to crop image:', error);
    // Return original as fallback
    return uri;
  }
};

// Helper for backward compatibility
export const cropImageWithRelative = async (
  uri: string,
  relativeCrop: { x: number; y: number; width: number; height: number }
): Promise<string> => {
  return cropImage(uri, relativeCrop, true);
};

// Helper for absolute coordinates
export const cropImageWithAbsolute = async (
  uri: string,
  absoluteCrop: { x: number; y: number; width: number; height: number }
): Promise<string> => {
  return cropImage(uri, absoluteCrop, false);
};