import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CallReactionKind, PublishCallExtras } from './callExtrasSignaling';

type FloatingReaction = {
  id: string;
  kind: CallReactionKind;
  name?: string;
};

const REACTION_GLYPH: Record<CallReactionKind, string> = {
  heart: '❤️',
  clap: '👏',
  fire: '🔥',
  wave: '👋',
};

const PICKER: CallReactionKind[] = ['heart', 'clap', 'fire', 'wave'];

type Props = {
  myName: string;
  publish: PublishCallExtras;
  /** Push a remote reaction into the overlay. */
  incoming: FloatingReaction | null;
};

export function CallReactionsBar({ myName, publish, incoming }: Props) {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);

  useEffect(() => {
    if (!incoming) return;
    setFloating((prev) => [...prev.slice(-8), incoming]);
    const t = setTimeout(() => {
      setFloating((prev) => prev.filter((r) => r.id !== incoming.id));
    }, 2200);
    return () => clearTimeout(t);
  }, [incoming]);

  const send = (kind: CallReactionKind) => {
    const at = Date.now();
    publish({ type: 'reaction', kind, name: myName, at });
    const local: FloatingReaction = {
      id: `local-${at}-${kind}`,
      kind,
      name: 'You',
    };
    setFloating((prev) => [...prev.slice(-8), local]);
    setTimeout(() => {
      setFloating((prev) => prev.filter((r) => r.id !== local.id));
    }, 2200);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.floatArea} pointerEvents="none">
        {floating.map((r, i) => (
          <View
            key={r.id}
            style={[styles.floatItem, { left: 12 + (i % 4) * 48, bottom: 8 + (i % 3) * 28 }]}
          >
            <Text style={styles.floatGlyph}>{REACTION_GLYPH[r.kind]}</Text>
            {r.name ? <Text style={styles.floatName}>{r.name}</Text> : null}
          </View>
        ))}
      </View>
      <View style={styles.bar}>
        {PICKER.map((kind) => (
          <TouchableOpacity key={kind} style={styles.btn} onPress={() => send(kind)}>
            <Text style={styles.btnGlyph}>{REACTION_GLYPH[kind]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export function reactionFromSignal(
  kind: CallReactionKind,
  name: string | undefined,
  at: number
): FloatingReaction {
  return {
    id: `remote-${at}-${kind}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    name: name?.trim() || 'Someone',
  };
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 136,
    zIndex: 25,
    alignItems: 'center',
  },
  floatArea: {
    ...StyleSheet.absoluteFillObject,
    bottom: 44,
  },
  floatItem: {
    position: 'absolute',
    alignItems: 'center',
  },
  floatGlyph: { fontSize: 28 },
  floatName: { color: '#fff', fontSize: 10, fontWeight: '600', marginTop: 2 },
  bar: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGlyph: { fontSize: 22 },
});
