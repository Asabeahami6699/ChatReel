import { supabaseAdmin } from '../lib/supabaseAdmin';

export type PollOptionDTO = {
  id: string;
  label: string;
  sort_order: number;
  vote_count: number;
  voted_by_me: boolean;
};

export type PollDTO = {
  id: string;
  message_id: string;
  group_id: string;
  question: string;
  allows_multiple: boolean;
  created_by: string;
  created_at: string;
  closes_at: string | null;
  total_votes: number;
  options: PollOptionDTO[];
};

function isClosed(closesAt: string | null): boolean {
  if (!closesAt) return false;
  return new Date(closesAt).getTime() <= Date.now();
}

export async function createGroupPoll(input: {
  messageId: string;
  groupId: string;
  createdBy: string;
  question: string;
  options: string[];
  allowsMultiple?: boolean;
  closesAt?: string | null;
}): Promise<PollDTO> {
  const labels = input.options.map((o) => o.trim()).filter(Boolean);
  if (labels.length < 2 || labels.length > 8) {
    throw new Error('Polls need 2–8 options');
  }
  const question = input.question.trim();
  if (!question) throw new Error('Poll question required');

  const { data: poll, error } = await supabaseAdmin
    .from('group_polls')
    .insert({
      message_id: input.messageId,
      group_id: input.groupId,
      question,
      allows_multiple: Boolean(input.allowsMultiple),
      created_by: input.createdBy,
      closes_at: input.closesAt ?? null,
    })
    .select('*')
    .single();
  if (error || !poll) throw new Error(error?.message || 'Could not create poll');

  const optionRows = labels.map((label, i) => ({
    poll_id: poll.id,
    label,
    sort_order: i,
  }));
  const { data: options, error: optErr } = await supabaseAdmin
    .from('group_poll_options')
    .insert(optionRows)
    .select('*');
  if (optErr || !options) throw new Error(optErr?.message || 'Could not create poll options');

  return {
    id: poll.id,
    message_id: poll.message_id,
    group_id: poll.group_id,
    question: poll.question,
    allows_multiple: poll.allows_multiple,
    created_by: poll.created_by,
    created_at: poll.created_at,
    closes_at: poll.closes_at,
    total_votes: 0,
    options: options
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({
        id: o.id,
        label: o.label,
        sort_order: o.sort_order,
        vote_count: 0,
        voted_by_me: false,
      })),
  };
}

export async function getPollByMessageId(
  messageId: string,
  viewerId: string
): Promise<PollDTO | null> {
  const { data: poll } = await supabaseAdmin
    .from('group_polls')
    .select('*')
    .eq('message_id', messageId)
    .maybeSingle();
  if (!poll) return null;

  const [{ data: options }, { data: votes }] = await Promise.all([
    supabaseAdmin
      .from('group_poll_options')
      .select('*')
      .eq('poll_id', poll.id)
      .order('sort_order', { ascending: true }),
    supabaseAdmin.from('group_poll_votes').select('option_id, user_id').eq('poll_id', poll.id),
  ]);

  const voteRows = votes ?? [];
  const myVotes = new Set(
    voteRows.filter((v) => v.user_id === viewerId).map((v) => v.option_id as string)
  );
  const counts = new Map<string, number>();
  for (const v of voteRows) {
    counts.set(v.option_id, (counts.get(v.option_id) ?? 0) + 1);
  }

  return {
    id: poll.id,
    message_id: poll.message_id,
    group_id: poll.group_id,
    question: poll.question,
    allows_multiple: poll.allows_multiple,
    created_by: poll.created_by,
    created_at: poll.created_at,
    closes_at: poll.closes_at,
    total_votes: voteRows.length,
    options: (options ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      sort_order: o.sort_order,
      vote_count: counts.get(o.id) ?? 0,
      voted_by_me: myVotes.has(o.id),
    })),
  };
}

export async function voteOnPoll(input: {
  pollId: string;
  optionId: string;
  userId: string;
}): Promise<PollDTO> {
  const { data: poll } = await supabaseAdmin
    .from('group_polls')
    .select('*')
    .eq('id', input.pollId)
    .maybeSingle();
  if (!poll) throw new Error('Poll not found');
  if (isClosed(poll.closes_at)) throw new Error('This poll is closed');

  const { data: option } = await supabaseAdmin
    .from('group_poll_options')
    .select('id')
    .eq('id', input.optionId)
    .eq('poll_id', input.pollId)
    .maybeSingle();
  if (!option) throw new Error('Invalid option');

  if (!poll.allows_multiple) {
    await supabaseAdmin
      .from('group_poll_votes')
      .delete()
      .eq('poll_id', input.pollId)
      .eq('user_id', input.userId);
  }

  const { error } = await supabaseAdmin.from('group_poll_votes').upsert(
    {
      poll_id: input.pollId,
      option_id: input.optionId,
      user_id: input.userId,
    },
    { onConflict: 'poll_id,user_id,option_id' }
  );
  if (error) throw new Error(error.message);

  const dto = await getPollByMessageId(poll.message_id, input.userId);
  if (!dto) throw new Error('Poll not found after vote');
  return dto;
}
