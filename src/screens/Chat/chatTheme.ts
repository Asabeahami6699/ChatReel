/** App blue theme (original ChatApp colours). */
export const chatTheme = {
  headerBg: '#007AFF',
  headerStatus: 'rgba(255, 255, 255, 0.85)',
  chatBg: '#f0f0f0',
  datePillBg: 'rgba(255, 255, 255, 0.95)',
  datePillText: '#666666',
  outgoingBubble: '#007AFF',
  incomingBubble: '#FFFFFF',
  outgoingText: '#FFFFFF',
  incomingText: '#111111',
  outgoingMeta: 'rgba(255, 255, 255, 0.75)',
  incomingMeta: 'rgba(0, 0, 0, 0.45)',
  readReceipt: '#34B7F1',
  primary: '#007AFF',
  inputBarBg: '#f0f0f0',
  inputFieldBg: '#FFFFFF',
  composerBorder: '#e0e0e0',
  scrollFabBg: '#FFFFFF',
  senderName: '#007AFF',
  link: '#007AFF',
};

export type ClusterPosition = 'single' | 'first' | 'middle' | 'last';

export function bubbleCorners(
  isOutgoing: boolean,
  position: ClusterPosition
): {
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomLeftRadius: number;
  borderBottomRightRadius: number;
} {
  const lg = 18;
  const sm = 4;

  if (position === 'single') {
    return isOutgoing
      ? {
          borderTopLeftRadius: lg,
          borderTopRightRadius: lg,
          borderBottomLeftRadius: lg,
          borderBottomRightRadius: sm,
        }
      : {
          borderTopLeftRadius: lg,
          borderTopRightRadius: lg,
          borderBottomLeftRadius: sm,
          borderBottomRightRadius: lg,
        };
  }

  if (isOutgoing) {
    switch (position) {
      case 'first':
        return {
          borderTopLeftRadius: lg,
          borderTopRightRadius: lg,
          borderBottomLeftRadius: lg,
          borderBottomRightRadius: sm,
        };
      case 'middle':
        return {
          borderTopLeftRadius: lg,
          borderTopRightRadius: sm,
          borderBottomLeftRadius: lg,
          borderBottomRightRadius: sm,
        };
      case 'last':
        return {
          borderTopLeftRadius: lg,
          borderTopRightRadius: sm,
          borderBottomLeftRadius: lg,
          borderBottomRightRadius: lg,
        };
    }
  }

  switch (position) {
    case 'first':
      return {
        borderTopLeftRadius: lg,
        borderTopRightRadius: lg,
        borderBottomLeftRadius: sm,
        borderBottomRightRadius: lg,
      };
    case 'middle':
      return {
        borderTopLeftRadius: sm,
        borderTopRightRadius: lg,
        borderBottomLeftRadius: sm,
        borderBottomRightRadius: lg,
      };
    case 'last':
      return {
        borderTopLeftRadius: sm,
        borderTopRightRadius: lg,
        borderBottomLeftRadius: lg,
        borderBottomRightRadius: lg,
      };
  }

  return {
    borderTopLeftRadius: lg,
    borderTopRightRadius: lg,
    borderBottomLeftRadius: lg,
    borderBottomRightRadius: lg,
  };
}
