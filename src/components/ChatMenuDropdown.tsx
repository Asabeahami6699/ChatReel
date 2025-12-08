// Alternative ChatMenuDropdown.tsx (Modal-based)
import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

export default function ChatMenuDropdown({ 
  items, 
  iconColor = '#fff',
  iconSize = 22 
}: Props) {
  const [visible, setVisible] = useState(false);

  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);

  const filteredItems = items.filter(item => !item.disabled);

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <>
      <TouchableOpacity 
        onPress={openMenu} 
        style={styles.trigger}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons 
          name="ellipsis-vertical" 
          size={iconSize} 
          color={iconColor} 
        />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menuContainer}>
                {filteredItems.map((item, index) => (
                  <TouchableOpacity
                    key={`${item.title}-${index}`}
                    style={[
                      styles.menuItem,
                      index === 0 && styles.firstMenuItem,
                      index === filteredItems.length - 1 && styles.lastMenuItem,
                    ]}
                    onPress={() => {
                      closeMenu();
                      setTimeout(() => item.onPress(), 100);
                    }}
                    disabled={item.disabled}
                  >
                    {item.icon && (
                      <Ionicons 
                        name={item.icon as any} 
                        size={20} 
                        color={item.destructive ? '#FF3B30' : '#666'} 
                        style={styles.menuIcon}
                      />
                    )}
                    <Text style={[
                      styles.menuText,
                      item.destructive && styles.destructiveText,
                      item.disabled && styles.disabledText
                    ]}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 200,
    maxWidth: 300,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  firstMenuItem: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  lastMenuItem: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  menuIcon: {
    marginRight: 12,
    width: 24,
  },
  menuText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '400',
    flex: 1,
  },
  destructiveText: {
    color: '#FF3B30',
    fontWeight: '500',
  },
  disabledText: {
    color: '#999',
    opacity: 0.5,
  },
});