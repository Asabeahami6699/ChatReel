// AttachmentPreview.tsx - Updated with react-native-image-crop-picker
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Modal,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Dimensions,
  StatusBar,
  Animated,
  PanResponder,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDrawingState } from './MediaEditor/useDrawingState';
import SimpleDrawingCanvas from './MediaEditor/SimpleDrawingCanvas';
import DrawingToolbar from './MediaEditor/DrawingToolbar';
import { exportEditedImage } from './MediaEditor/exportEditedImage';
import ImageEditor from './MediaEditor/ImageEditor';
import { ChatVideoPlayer } from './ChatVideoPlayer';
import { USE_NATIVE_DRIVER } from '../lib/animation';
import { computeAlbumGrid } from '../lib/mediaGridLayout';

const { width, height } = Dimensions.get('window');

/* -------------------------------- Types -------------------------------- */

type AttachmentFile = {
  id: string;
  uri: string;
  mimeType?: string;
  name?: string | null;
  size?: number;
  type: 'photo' | 'video' | 'audio' | 'document';
  thumbnail?: string;
  duration?: number;
  expiresInSeconds?: number | null;
  viewOnce?: boolean;
};

const VISIBILITY_OPTIONS: Array<{
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  seconds: number | null;
  once: boolean;
}> = [
  { key: 'everyone', label: 'Everyone', icon: 'earth', seconds: null, once: false },
  { key: '1m', label: '1 min', icon: 'timer-outline', seconds: 60, once: false },
  { key: '5m', label: '5 min', icon: 'timer-outline', seconds: 300, once: false },
  { key: '1h', label: '1 hour', icon: 'timer-outline', seconds: 3600, once: false },
  { key: '1d', label: '1 day', icon: 'timer-outline', seconds: 86400, once: false },
  { key: 'once', label: 'View once', icon: 'eye-outline', seconds: null, once: true },
];

type Props = {
  attachments: AttachmentFile[];
  visible: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onSendAll: (attachments: AttachmentFile[]) => void;
  /** Optional: send a single attachment (used by ChatRoomScreen for inline preview). */
  onSendSingle?: (attachment: AttachmentFile) => void;
};

/* ----------------------------- Main Component ---------------------------- */

const AttachmentPreview: React.FC<Props> = ({
  attachments,
  visible,
  onClose,
  onRemove,
  onClearAll,
  onSendAll,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [drawMode, setDrawMode] = useState(false);
  const [cropMode, setCropMode] = useState(false); // Added back for native cropper
  const [showTools, setShowTools] = useState(true);
  const [strokeColor, setStrokeColor] = useState('#ff3b3b');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [editedImages, setEditedImages] = useState<Record<string, string>>({});
  const [drawingData, setDrawingData] = useState<Record<string, any>>({});
  const [cropKey, setCropKey] = useState(0); // Added back for remounting
  const [viewMode, setViewMode] = useState<'grid' | 'detail'>('detail');
  const [visibilityKey, setVisibilityKey] = useState('everyone');
  
  const visualCount = attachments.filter(
    (a) => a.type === 'photo' || a.type === 'video'
  ).length;
  const canShowGrid = attachments.length >= 2 && visualCount === attachments.length;
  const gridHeight = height - 180;
  const gridCells = computeAlbumGrid(attachments.length, width - 24, gridHeight - 24, 3);
  const gridOverflow = attachments.length > 4 ? attachments.length - 4 : 0;
  // Refs
  const flatListRef = useRef<FlatList>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScale = useRef(1);
  const lastTranslate = useRef({ x: 0, y: 0 });
  
  // Drawing state management
  const drawingState = useDrawingState();

  // Pinch to zoom gesture handlers
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.numberActiveTouches > 0;
      },
      onPanResponderMove: (event, gestureState) => {
        const { numberActiveTouches } = gestureState;
        
        if (numberActiveTouches === 2) {
          const touches = event.nativeEvent.touches;
          const touch1 = touches[0];
          const touch2 = touches[1];
          
          const dx = touch1.pageX - touch2.pageX;
          const dy = touch1.pageY - touch2.pageY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (lastScale.current === 1) {
            lastScale.current = distance / 100;
          }
          
          const newScale = Math.max(1, Math.min(5, distance / 100 / lastScale.current));
          scale.setValue(newScale);
        } else if (numberActiveTouches === 1 && scale._value > 1) {
          const { dx, dy } = gestureState;
          const maxTranslate = 100 * (scale._value - 1);
          
          const newX = Math.max(-maxTranslate, Math.min(maxTranslate, lastTranslate.current.x + dx));
          const newY = Math.max(-maxTranslate, Math.min(maxTranslate, lastTranslate.current.y + dy));
          
          translateX.setValue(newX);
          translateY.setValue(newY);
        }
      },
      onPanResponderRelease: () => {
        lastScale.current = scale._value;
        lastTranslate.current = { x: translateX._value, y: translateY._value };
      },
      onPanResponderTerminate: () => {
        lastScale.current = scale._value;
        lastTranslate.current = { x: translateX._value, y: translateY._value };
      },
    })
  ).current;

  // Reset states when attachments change
  useEffect(() => {
    setCurrentIndex(0);
    setDrawMode(false);
    setCropMode(false);
    setShowTools(true);
    setStrokeColor('#ff3b3b');
    setStrokeWidth(4);
    setCropKey(0);
    setViewMode(
      attachments.length >= 2 &&
        attachments.every((a) => a.type === 'photo' || a.type === 'video')
        ? 'grid'
        : 'detail'
    );
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    lastScale.current = 1;
    lastTranslate.current = { x: 0, y: 0 };
  }, [attachments]);

  // Load drawing data for current image when index changes
  useEffect(() => {
    const currentFile = attachments[currentIndex];
    if (currentFile && currentFile.type === 'photo') {
      console.log('📝 Loading drawing for:', currentFile.id);
      if (drawingData[currentFile.id]) {
        drawingState.loadStrokes(drawingData[currentFile.id]);
      } else {
        drawingState.clear();
      }
    }
  }, [currentIndex, attachments]);

  const currentFile = attachments[currentIndex];

  const resolvePhotoUri = async (attachment: AttachmentFile): Promise<string> => {
    let baseUri = editedImages[attachment.id] || attachment.uri;
    const strokes =
      attachment.id === currentFile?.id && drawingState.strokes.length > 0
        ? drawingState.strokes
        : drawingData[attachment.id];

    if (strokes?.length) {
      try {
        return await exportEditedImage(baseUri, strokes);
      } catch {
        return baseUri;
      }
    }
    return baseUri;
  };

  // Handle sending edited images
  const handleSendAll = async () => {
    const visibility =
      VISIBILITY_OPTIONS.find((o) => o.key === visibilityKey) ?? VISIBILITY_OPTIONS[0];
    const applyVisibility = (a: AttachmentFile): AttachmentFile => ({
      ...a,
      expiresInSeconds: visibility.seconds,
      viewOnce: visibility.once,
    });

    const finalAttachments = await Promise.all(
      attachments.map(async (attachment) => {
        if (attachment.type === 'photo') {
          return applyVisibility({ ...attachment, uri: await resolvePhotoUri(attachment) });
        }
        return applyVisibility(attachment);
      })
    );

    onSendAll(finalAttachments);
  };

  // Save edited image
  const saveDrawing = async () => {
    if (!currentFile) return;
    
    console.log('💾 Saving drawing for:', currentFile.id);
    
    try {
      const currentStrokes = drawingState.strokes;
      setDrawingData(prev => ({
        ...prev,
        [currentFile.id]: currentStrokes
      }));
      
      const newUri = await exportEditedImage(
        currentFile.uri,
        currentStrokes
      );
      
      setEditedImages(prev => ({
        ...prev,
        [currentFile.id]: newUri,
      }));
      
      setDrawMode(false);
      console.log('✅ Drawing saved successfully');
    } catch (error) {
      console.error('❌ Failed to save drawing:', error);
      setDrawingData(prev => ({
        ...prev,
        [currentFile.id]: drawingState.strokes
      }));
      setDrawMode(false);
    }
  };

  // Start crop mode - Now using react-native-image-crop-picker
  const startCropMode = useCallback(() => {
    console.log('🌾 Starting crop mode for:', currentFile?.id);
    
    // Save current drawing before switching to crop
    if (currentFile && currentFile.type === 'photo' && drawingState.strokes.length > 0) {
      setDrawingData(prev => ({
        ...prev,
        [currentFile.id]: drawingState.strokes
      }));
    }
    
    setCropMode(true);
    setCropKey(prev => prev + 1); // Force new instance
    setShowTools(false);
    drawingState.clear(); // Clear drawing state
    
    // Reset zoom and pan
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    lastScale.current = 1;
    lastTranslate.current = { x: 0, y: 0 };
  }, [currentFile, drawingState]);

  // Save cropped image (callback from ImageEditor)
  const saveCrop = useCallback(async (croppedUri: string) => {
    if (!currentFile) return;
    
    console.log('💾 Saving crop for:', currentFile.id, 'URI:', croppedUri);
    
    try {
      setEditedImages(prev => ({
        ...prev,
        [currentFile.id]: croppedUri,
      }));
      setCropMode(false);
      setShowTools(true);
      console.log('✅ Crop saved successfully');
    } catch (error) {
      console.error('❌ Failed to save cropped image:', error);
      setCropMode(false);
      setShowTools(true);
    }
  }, [currentFile]);

  // Cancel crop mode
  const cancelCrop = useCallback(() => {
    console.log('❌ Canceling crop mode');
    setCropMode(false);
    setShowTools(true);
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
  }, []);

  // Handle thumbnail click
  const handleThumbnailClick = (clickedIndex: number) => {
    console.log('🖼️ Thumbnail clicked:', clickedIndex, 'Current:', currentIndex);
    
    // Save current drawing before switching
    if (currentFile && currentFile.type === 'photo' && drawingState.strokes.length > 0) {
      setDrawingData(prev => ({
        ...prev,
        [currentFile.id]: drawingState.strokes
      }));
    }
    
    // Update the current index FIRST
    setCurrentIndex(clickedIndex);
    
    // Force scroll to the selected item
    setTimeout(() => {
      if (flatListRef.current) {
        console.log('📜 Scrolling to index:', clickedIndex);
        flatListRef.current.scrollToIndex({
          index: clickedIndex,
          animated: true,
          viewPosition: 0.5,
        });
      }
    }, 10);
    
    // Reset zoom and pan
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    lastScale.current = 1;
    lastTranslate.current = { x: 0, y: 0 };
    
    // Exit edit modes
    if (drawMode) setDrawMode(false);
    if (cropMode) setCropMode(false);
  };

  // Handle scroll end
  const handleScrollEnd = (e: any) => {
    const contentOffsetX = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(contentOffsetX / width);
    
    if (newIndex !== currentIndex) {
      console.log('🔄 Scroll ended, new index:', newIndex);
      setCurrentIndex(newIndex);
    }
  };

  const handleViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const visibleIndex = viewableItems[0].index;
      if (visibleIndex !== undefined && visibleIndex !== currentIndex) {
        console.log('👀 Viewable items changed, new index:', visibleIndex);
        setCurrentIndex(visibleIndex);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Zoom functions
  const zoomIn = () => {
    const newScale = Math.min(scale._value * 1.2, 5);
    Animated.spring(scale, {
      toValue: newScale,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => {
      lastScale.current = newScale;
    });
  };

  const zoomOut = () => {
    const newScale = Math.max(scale._value / 1.2, 1);
    Animated.spring(scale, {
      toValue: newScale,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => {
      lastScale.current = newScale;
      if (newScale === 1) {
        translateX.setValue(0);
        translateY.setValue(0);
        lastTranslate.current = { x: 0, y: 0 };
      }
    });
  };

  const increaseStrokeWidth = () => {
    setStrokeWidth(prev => Math.min(prev + 2, 20));
  };

  const decreaseStrokeWidth = () => {
    setStrokeWidth(prev => Math.max(prev - 2, 1));
  };

  // Cancel drawing mode
  const cancelDrawing = () => {
    if (currentFile && drawingState.strokes.length > 0) {
      setDrawingData(prev => ({
        ...prev,
        [currentFile.id]: drawingState.strokes
      }));
    }
    setDrawMode(false);
  };

  // Clear drawing for current image
  const clearCurrentDrawing = () => {
    if (currentFile) {
      setDrawingData(prev => ({
        ...prev,
        [currentFile.id]: []
      }));
      drawingState.clear();
    }
  };

  const openDetailAt = (index: number) => {
    setCurrentIndex(index);
    setViewMode('detail');
    setDrawMode(false);
    setCropMode(false);
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index, animated: false });
    }, 0);
  };

  const renderGridTile = (item: AttachmentFile, cellIndex: number) => {
    const previewUri = editedImages[item.id] || item.thumbnail || item.uri;
    const showOverflow = gridOverflow > 0 && cellIndex === 3;

    return (
      <>
        {item.type === 'video' ? (
          <Image source={{ uri: previewUri }} style={styles.gridImage} resizeMode="cover" />
        ) : (
          <Image source={{ uri: previewUri }} style={styles.gridImage} resizeMode="cover" />
        )}
        {item.type === 'video' && (
          <View style={styles.gridVideoBadge}>
            <Ionicons name="play" size={22} color="#fff" />
          </View>
        )}
        {showOverflow && (
          <View style={styles.gridOverflow}>
            <Text style={styles.gridOverflowText}>+{gridOverflow}</Text>
          </View>
        )}
      </>
    );
  };

  if (!visible || attachments.length === 0) return null;

  return (
    <Modal visible={visible} animationType="fade">
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (viewMode === 'detail' && canShowGrid) {
                setViewMode('grid');
                setDrawMode(false);
                setCropMode(false);
              } else {
                onClose();
              }
            }}
            style={styles.headerButton}
          >
            <Ionicons
              name={viewMode === 'detail' && canShowGrid ? 'arrow-back' : 'close'}
              size={26}
              color="#fff"
            />
          </TouchableOpacity>

          <Text style={styles.counter}>
            {viewMode === 'grid'
              ? `${attachments.length} selected`
              : `${currentIndex + 1} / ${attachments.length}`}
          </Text>

          <TouchableOpacity onPress={onClearAll} style={styles.headerButton}>
            <Text style={styles.clear}>Clear All</Text>
          </TouchableOpacity>
        </View>

        {viewMode === 'grid' && canShowGrid ? (
          <View style={[styles.gridPage, { height: gridHeight }]}>
            {gridCells.map((cell) => {
              const item = attachments[cell.index];
              if (!item) return null;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.9}
                  style={[
                    styles.gridCell,
                    {
                      left: cell.left + 12,
                      top: cell.top + 12,
                      width: cell.width,
                      height: cell.height,
                    },
                  ]}
                  onPress={() => openDetailAt(cell.index)}
                >
                  {renderGridTile(item, cell.index)}
                </TouchableOpacity>
              );
            })}
            <Text style={styles.gridHint}>Tap a tile to preview or edit</Text>
          </View>
        ) : (
        /* Main Content Area — detail / edit */
        <FlatList
          ref={flatListRef}
          data={attachments}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.id}
          onMomentumScrollEnd={handleScrollEnd}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(data, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          initialScrollIndex={currentIndex}
          extraData={{ currentIndex, editedImages, drawingData, cropMode }}
          renderItem={({ item, index: itemIndex }) => {
            const isCurrentItem = itemIndex === currentIndex;
            
            return (
              <View style={styles.page}>
                {item.type === 'photo' && (
                  <View style={styles.photoContainer}>
                    {cropMode && isCurrentItem ? (
                      // Crop Mode with react-native-image-crop-picker
                      <ImageEditor
                        key={`crop-${item.id}-${cropKey}`} // Force remount
                        source={{ uri: editedImages[item.id] || item.uri }}
                        onSave={saveCrop}
                        onCancel={cancelCrop}
                        aspectRatio="free" // Options: 'free' | '1:1' | '4:3' | '16:9'
                      />
                    ) : drawMode && isCurrentItem ? (
                      // Drawing Canvas Mode
                      <View style={styles.canvasContainer}>
                        <Image
                          source={{ uri: editedImages[item.id] || item.uri }}
                          style={styles.backgroundImage}
                          resizeMode="contain"
                        />
                        <SimpleDrawingCanvas
                          width={width}
                          height={height - 220}
                          color={strokeColor}
                          strokeWidth={strokeWidth}
                          drawing={drawingState}
                        />
                      </View>
                    ) : (
                      // Normal Image View
                      <Animated.View
                        style={[
                          styles.imageWrapper,
                          {
                            transform: [
                              { scale: isCurrentItem ? scale : 1 },
                              { translateX: isCurrentItem ? translateX : 0 },
                              { translateY: isCurrentItem ? translateY : 0 },
                            ],
                          },
                        ]}
                        {...(isCurrentItem ? panResponder.panHandlers : {})}
                      >
                        <Image
                          source={{ uri: editedImages[item.id] || item.uri }}
                          style={styles.media}
                          resizeMode="contain"
                        />
                        {drawingData[item.id] && drawingData[item.id].length > 0 && (
                          <View style={styles.persistentDrawingOverlay}>
                            <SimpleDrawingCanvas
                              width={width}
                              height={height - 220}
                              color={strokeColor}
                              strokeWidth={strokeWidth}
                              drawing={{
                                strokes: drawingData[item.id],
                                clear: () => {},
                                addStroke: () => {},
                                undo: () => {},
                                redoStroke: () => {},
                                loadStrokes: () => {},
                                currentStroke: null,
                                currentPoints: []
                              }}
                            />
                          </View>
                        )}
                      </Animated.View>
                    )}
                  </View>
                )}

                {item.type === 'video' && (
                  <View style={styles.videoContainer}>
                    <ChatVideoPlayer
                      uri={item.uri}
                      thumbnailUri={item.thumbnail}
                      previewMode
                      style={{ width, height: height - 180 }}
                    />
                  </View>
                )}

                {(item.type === 'audio' || item.type === 'document') && (
                  <View style={styles.fileCard}>
                    <Ionicons 
                      name={item.type === 'audio' ? 'musical-notes' : 'document'} 
                      size={80} 
                      color="#fff" 
                    />
                    <Text style={styles.fileName} numberOfLines={2}>
                      {item.name || `Untitled ${item.type}`}
                    </Text>
                    {item.size && (
                      <Text style={styles.fileSize}>
                        {(item.size / (1024 * 1024)).toFixed(2)} MB
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
        )}

        {/* Floating Tools (Collapsible) */}
        {viewMode === 'detail' && showTools && currentFile?.type === 'photo' && !drawMode && !cropMode && (
          <View style={styles.floatingTools}>
            <TouchableOpacity 
              style={styles.toolButton}
              onPress={() => setDrawMode(true)}
            >
              <Ionicons name="brush" size={20} color="#fff" />
              <Text style={styles.toolText}>Draw</Text>
            </TouchableOpacity>
            
            {/* ADDED BACK CROP BUTTON */}
            <TouchableOpacity 
              style={styles.toolButton}
              onPress={startCropMode}
            >
              <Ionicons name="crop" size={20} color="#fff" />
              <Text style={styles.toolText}>Crop</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.toolButton}
              onPress={zoomIn}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.toolText}>Zoom In</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.toolButton}
              onPress={zoomOut}
            >
              <Ionicons name="remove" size={20} color="#fff" />
              <Text style={styles.toolText}>Zoom Out</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.toolButton}
              onPress={() => onRemove(currentFile.id)}
            >
              <Ionicons name="trash-outline" size={20} color="#ff4444" />
              <Text style={[styles.toolText, { color: '#ff4444' }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}

        {viewMode === 'detail' && showTools && currentFile?.type === 'video' && !drawMode && !cropMode && (
          <View style={styles.floatingTools}>
            <TouchableOpacity
              style={styles.toolButton}
              onPress={() => onRemove(currentFile.id)}
            >
              <Ionicons name="trash-outline" size={20} color="#ff4444" />
              <Text style={[styles.toolText, { color: '#ff4444' }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}

        {!drawMode && !cropMode && viewMode === 'detail' && canShowGrid && (
          <TouchableOpacity
            style={styles.gridToggle}
            onPress={() => setViewMode('grid')}
          >
            <Ionicons name="grid-outline" size={22} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Show/Hide Tools Toggle */}
        {!drawMode && !cropMode && viewMode === 'detail' && (
          <TouchableOpacity
            style={styles.toggleToolsButton}
            onPress={() => setShowTools(!showTools)}
          >
            <Ionicons 
              name={showTools ? "chevron-down" : "chevron-up"} 
              size={24} 
              color="#fff" 
            />
          </TouchableOpacity>
        )}

        {/* Drawing Toolbar (for photos) */}
        {viewMode === 'detail' && currentFile?.type === 'photo' && drawMode && (
          <>
            <DrawingToolbar
              undo={drawingState.undo}
              redo={drawingState.redoStroke}
              color={strokeColor}
              setColor={setStrokeColor}
              inc={increaseStrokeWidth}
              dec={decreaseStrokeWidth}
              clear={clearCurrentDrawing}
            />
            
            <View style={styles.drawingControls}>
              <TouchableOpacity
                style={[styles.drawingButton, styles.cancelButton]}
                onPress={cancelDrawing}
              >
                <Text style={styles.drawingButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.drawingButton, styles.saveButton]}
                onPress={saveDrawing}
              >
                <Text style={styles.drawingButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Disappearing media / view-once selector */}
        <View style={styles.visibilityBar}>
          <Ionicons name="eye-off-outline" size={15} color="#9aa0a6" style={styles.visibilityLabelIcon} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.visibilityChips}
          >
            {VISIBILITY_OPTIONS.map((opt) => {
              const active = opt.key === visibilityKey;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.visibilityChip, active && styles.visibilityChipActive]}
                  onPress={() => setVisibilityKey(opt.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={opt.icon}
                    size={13}
                    color={active ? '#fff' : '#cfd3d6'}
                  />
                  <Text style={[styles.visibilityChipText, active && styles.visibilityChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Combined Footer with Thumbnails and Send Button */}
        <View style={styles.combinedFooter}>
          {/* Thumbnail Strip (takes 3/4 width) */}
          <View style={styles.thumbStrip}>
            <FlatList
              data={attachments}
              horizontal
              keyExtractor={item => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbsContent}
              extraData={{ editedImages, currentIndex }}
              renderItem={({ item, index: i }) => (
                <TouchableOpacity
                  onPress={() => handleThumbnailClick(i)}
                  style={[
                    styles.thumbWrap,
                    i === currentIndex && styles.thumbActive,
                  ]}
                  activeOpacity={0.7}
                >
                  {item.type === 'photo' ? (
                    <Image
                      source={{ uri: editedImages[item.id] || item.thumbnail || item.uri }}
                      style={styles.thumb}
                      resizeMode="cover"
                    />
                  ) : item.type === 'video' ? (
                    <View style={styles.videoThumb}>
                      {item.thumbnail ? (
                        <Image
                          source={{ uri: item.thumbnail }}
                          style={styles.thumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.placeholderThumb}>
                          <Ionicons name="play-circle" size={20} color="#fff" />
                        </View>
                      )}
                      <View style={styles.videoIconOverlay}>
                        <Ionicons name="play-circle" size={16} color="#fff" />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.fileThumb}>
                      <Ionicons 
                        name={item.type === 'audio' ? 'musical-notes' : 'document'} 
                        size={24} 
                        color="#fff" 
                      />
                    </View>
                  )}
                  {editedImages[item.id] && (
                    <View style={styles.editedBadge}>
                      <Ionicons name="checkmark-circle" size={10} color="#0b62ff" />
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>

          {/* Send Button (takes 1/4 width) */}
          <TouchableOpacity 
            style={styles.sendButton} 
            onPress={handleSendAll}
            activeOpacity={0.8}
          >
            <View style={styles.sendButtonContent}>
              <Ionicons name="send" size={22} color="#fff" />
              <Text style={styles.sendText}>Send</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default AttachmentPreview;

/* -------------------------------- Styles -------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 11, 11, 0.95)',
  },
  headerButton: {
    padding: 8,
  },
  counter: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  clear: {
    color: '#ff5c5c',
    fontWeight: '600',
    fontSize: 16,
  },
  page: {
    width,
    height: height - 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridPage: {
    width,
    position: 'relative',
    paddingBottom: 8,
  },
  gridCell: {
    position: 'absolute',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridVideoBadge: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  gridOverflow: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  gridOverflowText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  gridHint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    color: '#888',
    fontSize: 13,
  },
  gridToggle: {
    position: 'absolute',
    left: 16,
    top: 70,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
  },
  persistentDrawingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  canvasContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  videoContainer: {
    width: '100%',
    height: '100%',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  fileCard: {
    alignItems: 'center',
    padding: 20,
  },
  fileName: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
    maxWidth: width - 40,
  },
  fileSize: {
    color: '#aaa',
    marginTop: 5,
    fontSize: 14,
  },
  floatingTools: {
    position: 'absolute',
    right: 16,
    top: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 20,
    padding: 12,
    gap: 12,
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  toolText: {
    color: '#fff',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
  },
  toggleToolsButton: {
    position: 'absolute',
    right: 16,
    top: 70,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawingControls: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 16,
  },
  drawingButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 59, 59, 0.2)',
    borderWidth: 1,
    borderColor: '#ff3b3b',
  },
  saveButton: {
    backgroundColor: 'rgba(11, 98, 255, 0.2)',
    borderWidth: 1,
    borderColor: '#0b62ff',
  },
  drawingButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  visibilityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 12,
    backgroundColor: 'rgba(11, 11, 11, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  visibilityLabelIcon: {
    marginRight: 8,
  },
  visibilityChips: {
    alignItems: 'center',
    paddingRight: 12,
  },
  visibilityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 8,
  },
  visibilityChipActive: {
    backgroundColor: '#0b62ff',
  },
  visibilityChipText: {
    color: '#cfd3d6',
    fontSize: 12.5,
    fontWeight: '600',
    marginLeft: 5,
  },
  visibilityChipTextActive: {
    color: '#fff',
  },
  combinedFooter: {
    flexDirection: 'row',
    height: 85,
    backgroundColor: 'rgba(11, 11, 11, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center',
  },
  thumbStrip: {
    flex: 3,
    height: '100%',
  },
  thumbsContent: {
    paddingLeft: 12,
    paddingRight: 8,
    alignItems: 'center',
  },
  sendButton: {
    flex: 1,
    backgroundColor: '#0b62ff',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 12,
    marginRight: 16,
    borderRadius: 12,
    height: 56,
  },
  sendButtonContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  thumbWrap: {
    width: 56,
    height: 56,
    marginRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
    opacity: 0.6,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: {
    opacity: 1,
    borderColor: '#0b62ff',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  videoThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  videoIconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  placeholderThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileThumb: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
  },
  editedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 2,
    zIndex: 1,
  },
});