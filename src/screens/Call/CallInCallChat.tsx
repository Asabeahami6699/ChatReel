import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CallExtrasSignal, PublishCallExtras } from './callExtrasSignaling';

export type InCallChatMessage = {
  id: string;
  text: string;
  name: string;
  mine: boolean;
  at: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  myName: string;
  publish: PublishCallExtras;
  messages: InCallChatMessage[];
  onLocalSend: (msg: InCallChatMessage) => void;
};

export function CallInCallChat({
  visible,
  onClose,
  myName,
  publish,
  messages,
  onLocalSend,
}: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!visible || messages.length === 0) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, visible]);

  if (!visible) return null;

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const msg: InCallChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed.slice(0, 280),
      name: myName,
      mine: true,
      at: Date.now(),
    };
    publish({ type: 'chat', text: msg.text, name: myName, at: msg.at });
    onLocalSend(msg);
    setText('');
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheet}
      >
        <View style={styles.header}>
          <Text style={styles.title}>In-call chat</Text>
          <Text style={styles.hint}>Only people on this call · not saved</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              {!item.mine ? <Text style={styles.bubbleName}>{item.name}</Text> : null}
              <Text style={styles.bubbleText}>{item.text}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Say hi — messages disappear when the call ends.</Text>
          }
        />
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor="#888"
            maxLength={280}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={send}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function appendRemoteChat(
  signal: Extract<CallExtrasSignal, { type: 'chat' }>,
  mine: boolean
): InCallChatMessage {
  return {
    id: `${signal.at}-${signal.name ?? 'peer'}-${Math.random().toString(36).slice(2, 6)}`,
    text: signal.text,
    name: signal.name?.trim() || 'Someone',
    mine,
    at: signal.at,
  };
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '55%',
    backgroundColor: '#111827',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint: { flex: 1, color: '#9ca3af', fontSize: 11 },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  empty: { color: '#6b7280', textAlign: 'center', paddingVertical: 24, fontSize: 13 },
  bubble: {
    maxWidth: '82%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f2937',
  },
  bubbleName: { color: '#93c5fd', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  bubbleText: { color: '#fff', fontSize: 14 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0b1220',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    color: '#fff',
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
