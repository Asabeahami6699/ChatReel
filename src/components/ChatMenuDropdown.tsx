// ChatMenuDropdown.tsx — anchored under the ⋮ trigger on the right
import React, { useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../context/ChatSettingsContext';

export type MenuItem = {
  title: string;
  icon?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type Props = {
  items: MenuItem[];
  iconColor?: string;
  iconSize?: number;
};

const MENU_WIDTH = 232;

export default function ChatMenuDropdown({
  items,
  iconColor = '#fff',
  iconSize = 22,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ top: 56, right: 12 });
  const triggerRef = useRef<View>(null);
  const { theme } = useChatSettings();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const filteredItems = items.filter((item) => !item.disabled);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      const right = Math.max(8, windowWidth - (x + w));
      const top = Math.min(y + h + 6, windowHeight - 220);
      setAnchor({
        top: Math.max(insets.top + 4, top),
        right,
      });
      setVisible(true);
    });
  };

  const closeMenu = () => setVisible(false);

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <TouchableOpacity
          onPress={openMenu}
          style={styles.trigger}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Chat menu"
          accessibilityRole="button"
        >
          <Ionicons name="ellipsis-vertical" size={iconSize} color={iconColor} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable style={styles.modalOverlay} onPress={closeMenu} />
          <View
            style={[
              styles.menuContainer,
              {
                top: anchor.top,
                right: anchor.right,
                width: MENU_WIDTH,
                maxHeight: Math.min(420, windowHeight - anchor.top - 16),
                backgroundColor: theme.listCardBg,
                borderColor: theme.listBorder,
                borderWidth: theme.isDark ? 1 : 0,
              },
            ]}
          >
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filteredItems.map((item, index) => (
                <TouchableOpacity
                  key={`${item.title}-${index}`}
                  style={[
                    styles.menuItem,
                    index < filteredItems.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.listBorder,
                    },
                  ]}
                  onPress={() => {
                    const action = item.onPress;
                    closeMenu();
                    // Let the modal unmount before navigating / alerting.
                    setTimeout(() => action(), 50);
                  }}
                  disabled={item.disabled}
                  activeOpacity={0.7}
                >
                  {item.icon ? (
                    <Ionicons
                      name={item.icon as any}
                      size={20}
                      color={item.destructive ? '#FF3B30' : theme.listPrimaryText}
                      style={styles.menuIcon}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.menuText,
                      { color: theme.listPrimaryText },
                      item.destructive && styles.destructiveText,
                      item.disabled && styles.disabledText,
                    ]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRoot: {
    flex: 1,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  menuContainer: {
    position: 'absolute',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
    paddingVertical: 4,
    zIndex: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  menuIcon: {
    marginRight: 12,
    width: 24,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  destructiveText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  disabledText: {
    color: '#999',
    opacity: 0.5,
  },
});
