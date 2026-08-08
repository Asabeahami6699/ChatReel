import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, type GroupPollDTO } from '../lib/api';
import { useChatSettings } from '../context/ChatSettingsContext';
import { showAppToast } from '../lib/appToast';

type Props = {
  messageId: string;
  initialPoll?: GroupPollDTO | null;
  isOutgoing?: boolean;
};

export function PollMessageBubble({ messageId, initialPoll, isOutgoing }: Props) {
  const { theme } = useChatSettings();
  const [poll, setPoll] = useState<GroupPollDTO | null>(initialPoll ?? null);
  const [loading, setLoading] = useState(!initialPoll);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (initialPoll) {
      setPoll(initialPoll);
      setLoading(false);
      return;
    }
    let alive = true;
    void api.polls
      .byMessage(messageId)
      .then((res) => {
        if (alive) setPoll(res.poll);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [messageId, initialPoll]);

  const vote = async (optionId: string) => {
    if (!poll || voting) return;
    setVoting(true);
    try {
      const { poll: next } = await api.polls.vote(poll.id, optionId);
      setPoll(next);
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Could not vote', { isError: true });
    } finally {
      setVoting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: isOutgoing ? 'rgba(255,255,255,0.15)' : theme.listCardBg }]}>
        <ActivityIndicator color={theme.tabActive} />
      </View>
    );
  }
  if (!poll) {
    return (
      <View style={[styles.card, { backgroundColor: isOutgoing ? 'rgba(255,255,255,0.15)' : theme.listCardBg }]}>
        <Text style={{ color: isOutgoing ? '#fff' : theme.listSecondaryText }}>Poll unavailable</Text>
      </View>
    );
  }

  const maxVotes = Math.max(1, ...poll.options.map((o) => o.vote_count));
  const textColor = isOutgoing ? '#fff' : theme.listPrimaryText;
  const subColor = isOutgoing ? 'rgba(255,255,255,0.75)' : theme.listSecondaryText;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isOutgoing ? 'rgba(255,255,255,0.14)' : theme.listCardBg,
          borderColor: isOutgoing ? 'rgba(255,255,255,0.2)' : theme.listBorder,
        },
      ]}
    >
      <View style={styles.header}>
        <Ionicons name="bar-chart" size={16} color={isOutgoing ? '#fff' : theme.tabActive} />
        <Text style={[styles.question, { color: textColor }]}>{poll.question}</Text>
      </View>
      {poll.options.map((opt) => {
        const pct = Math.round((opt.vote_count / Math.max(1, poll.total_votes)) * 100);
        return (
          <TouchableOpacity
            key={opt.id}
            style={styles.option}
            onPress={() => void vote(opt.id)}
            disabled={voting}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.bar,
                {
                  width: `${Math.max(opt.vote_count > 0 ? 8 : 0, (opt.vote_count / maxVotes) * 100)}%`,
                  backgroundColor: opt.voted_by_me
                    ? isOutgoing
                      ? 'rgba(255,255,255,0.35)'
                      : 'rgba(25,118,210,0.25)'
                    : isOutgoing
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(0,0,0,0.06)',
                },
              ]}
            />
            <View style={styles.optionRow}>
              <Text style={[styles.optionLabel, { color: textColor }]} numberOfLines={2}>
                {opt.voted_by_me ? '✓ ' : ''}
                {opt.label}
              </Text>
              <Text style={[styles.optionPct, { color: subColor }]}>
                {poll.total_votes ? `${pct}%` : '—'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
      <Text style={[styles.footer, { color: subColor }]}>
        {poll.total_votes} vote{poll.total_votes === 1 ? '' : 's'}
        {poll.allows_multiple ? ' · multiple allowed' : ''}
      </Text>
    </View>
  );
}

type ComposerProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { question: string; options: string[]; allowsMultiple: boolean }) => void;
  busy?: boolean;
};

export function PollComposerSheet({ visible, onClose, onSubmit, busy }: ComposerProps) {
  const { theme } = useChatSettings();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowsMultiple, setAllowsMultiple] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuestion('');
      setOptions(['', '']);
      setAllowsMultiple(false);
    }
  }, [visible]);

  if (!visible) return null;

  const canSubmit =
    question.trim().length > 0 &&
    options.filter((o) => o.trim()).length >= 2 &&
    !busy;

  return (
    <View style={styles.composerBackdrop}>
      <View style={[styles.composerCard, { backgroundColor: theme.listCardBg }]}>
        <Text style={[styles.composerTitle, { color: theme.listPrimaryText }]}>New poll</Text>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask a question…"
          placeholderTextColor={theme.listSecondaryText}
          style={[
            styles.input,
            { color: theme.listPrimaryText, borderColor: theme.listBorder },
          ]}
        />
        {options.map((opt, i) => (
          <TextInput
            key={i}
            value={opt}
            onChangeText={(t) =>
              setOptions((prev) => prev.map((p, idx) => (idx === i ? t : p)))
            }
            placeholder={`Option ${i + 1}`}
            placeholderTextColor={theme.listSecondaryText}
            style={[
              styles.input,
              { color: theme.listPrimaryText, borderColor: theme.listBorder },
            ]}
          />
        ))}
        {options.length < 8 ? (
          <TouchableOpacity
            onPress={() => setOptions((prev) => [...prev, ''])}
            style={styles.addOpt}
          >
            <Text style={{ color: theme.tabActive, fontWeight: '700' }}>+ Add option</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.multiRow}
          onPress={() => setAllowsMultiple((v) => !v)}
        >
          <Ionicons
            name={allowsMultiple ? 'checkbox' : 'square-outline'}
            size={20}
            color={theme.tabActive}
          />
          <Text style={{ color: theme.listPrimaryText }}>Allow multiple answers</Text>
        </TouchableOpacity>
        <View style={styles.composerActions}>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={{ color: theme.listSecondaryText, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!canSubmit}
            style={[styles.sendBtn, !canSubmit && { opacity: 0.5 }]}
            onPress={() =>
              onSubmit({
                question: question.trim(),
                options: options.map((o) => o.trim()).filter(Boolean),
                allowsMultiple,
              })
            }
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendText}>Post poll</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 220,
    maxWidth: 300,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  question: { flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  option: {
    borderRadius: 10,
    overflow: 'hidden',
    minHeight: 36,
    justifyContent: 'center',
  },
  bar: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  optionLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  optionPct: { fontSize: 12, fontWeight: '700' },
  footer: { fontSize: 11, marginTop: 2 },
  composerBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 40,
  },  composerCard: {
    borderRadius: 16,
    padding: 16,
    gap: 10,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  composerTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  addOpt: { paddingVertical: 4 },
  multiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  composerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  sendBtn: {
    backgroundColor: '#1976d2',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700' },
});
