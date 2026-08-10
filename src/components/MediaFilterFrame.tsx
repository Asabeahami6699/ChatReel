import React, { useLayoutEffect, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  getReelFilterCssFilter,
  getReelFilterOverlay,
  type ReelFilterId,
} from '../screens/Reel/reelFilters';

type Props = {
  filterId?: ReelFilterId | string | null;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

type DomStyle = CSSStyleDeclaration & { webkitFilter?: string };

function asDomElement(node: unknown): HTMLElement | null {
  if (!node || typeof node !== 'object') return null;
  if (typeof (node as HTMLElement).style?.setProperty === 'function') {
    return node as HTMLElement;
  }
  const nested =
    (node as { _nativeNode?: unknown })._nativeNode ??
    (node as { getNode?: () => unknown }).getNode?.();
  if (nested && typeof (nested as HTMLElement).style?.setProperty === 'function') {
    return nested as HTMLElement;
  }
  return null;
}

function applyCssFilter(el: HTMLElement, cssFilter: string | null) {
  const value = cssFilter || 'none';
  el.style.filter = value;
  (el.style as DomStyle).webkitFilter = value;
  el.querySelectorAll?.('img, video').forEach((media) => {
    const m = media as HTMLElement;
    if (!m.style) return;
    m.style.filter = value;
    (m.style as DomStyle).webkitFilter = value;
  });
}

/**
 * Applies reel/moment color grades to media.
 *
 * RN Web strips CSS `filter` from StyleSheet, so on web we write filter
 * directly onto the host DOM node (and nested img/video). Overlay tints
 * still render on native as a fallback.
 */
export function MediaFilterFrame({ filterId, style, children }: Props) {
  const hostRef = useRef<View>(null);
  const cssFilter = getReelFilterCssFilter(filterId);
  const overlay = getReelFilterOverlay(filterId);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = asDomElement(hostRef.current);
    if (!el) return;

    applyCssFilter(el, cssFilter);

    // Video/img may mount after the first paint (expo-video).
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => applyCssFilter(el, cssFilter))
        : null;
    mo?.observe(el, { childList: true, subtree: true });

    return () => {
      mo?.disconnect();
      applyCssFilter(el, null);
    };
  }, [cssFilter, filterId]);

  return (
    <View ref={hostRef} collapsable={false} style={[styles.host, style]}>
      {children}
      {overlay ? (
        <View
          style={[styles.overlay, { backgroundColor: overlay }]}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
});
