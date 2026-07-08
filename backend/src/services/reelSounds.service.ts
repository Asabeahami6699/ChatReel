import { supabaseAdmin } from '../lib/supabaseAdmin';

export type ReelSoundSourceType = 'licensed' | 'ugc' | 'extracted';

export type ReelSoundRow = {
  id: string;
  title: string;
  artist: string | null;
  audio_url: string;
  preview_url: string | null;
  duration_sec: number | null;
  cover_url: string | null;
  usage_count: number;
  is_active: boolean;
  uploaded_by: string | null;
  genre: string | null;
  mood: string | null;
  source_type: ReelSoundSourceType;
  source_reel_id: string | null;
  created_at: string;
};

export const REEL_SOUND_GENRES = [
  'afrobeats',
  'pop',
  'hip-hop',
  'chill',
  'electronic',
  'acoustic',
  'latin',
  'r&b',
] as const;

export async function listReelSounds(opts: {
  q?: string;
  limit?: number;
  trending?: boolean;
  newest?: boolean;
  uploadedByProfileId?: string;
  genre?: string;
  mood?: string;
  licensedOnly?: boolean;
}): Promise<ReelSoundRow[]> {
  const limit = Math.min(opts.limit ?? 30, 50);
  let query = supabaseAdmin.from('reel_sounds').select('*').eq('is_active', true).limit(limit);

  if (opts.uploadedByProfileId) {
    query = query
      .eq('uploaded_by', opts.uploadedByProfileId)
      .order('created_at', { ascending: false });
  } else if (opts.genre) {
    query = query
      .eq('genre', opts.genre)
      .order('usage_count', { ascending: false })
      .order('created_at', { ascending: false });
  } else if (opts.mood) {
    query = query
      .eq('mood', opts.mood)
      .order('usage_count', { ascending: false })
      .order('created_at', { ascending: false });
  } else if (opts.licensedOnly) {
    query = query
      .eq('source_type', 'licensed')
      .order('usage_count', { ascending: false })
      .order('created_at', { ascending: false });
  } else if (opts.newest) {
    query = query.order('created_at', { ascending: false });
  } else if (opts.trending) {
    query = query.order('usage_count', { ascending: false }).order('created_at', { ascending: false });
  } else {
    query = query.order('title', { ascending: true });
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as ReelSoundRow[];
  const q = opts.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.artist?.toLowerCase().includes(q) ?? false) ||
        (s.genre?.toLowerCase().includes(q) ?? false) ||
        (s.mood?.toLowerCase().includes(q) ?? false)
    );
  }
  return rows;
}

export async function getReelSoundById(id: string): Promise<ReelSoundRow | null> {
  const { data, error } = await supabaseAdmin
    .from('reel_sounds')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ReelSoundRow | null) ?? null;
}

export async function getReelSoundBySourceReelId(reelId: string): Promise<ReelSoundRow | null> {
  const { data, error } = await supabaseAdmin
    .from('reel_sounds')
    .select('*')
    .eq('source_reel_id', reelId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ReelSoundRow | null) ?? null;
}

export async function assertReelSoundActive(soundId: string): Promise<ReelSoundRow> {
  const sound = await getReelSoundById(soundId);
  if (!sound) throw new Error('Sound not found or inactive');
  return sound;
}

export async function createReelSound(input: {
  title: string;
  artist?: string | null;
  audio_url: string;
  preview_url?: string | null;
  duration_sec?: number | null;
  cover_url?: string | null;
  uploaded_by?: string | null;
  genre?: string | null;
  mood?: string | null;
  source_type?: ReelSoundSourceType;
  source_reel_id?: string | null;
}): Promise<ReelSoundRow> {
  const { data, error } = await supabaseAdmin
    .from('reel_sounds')
    .insert({
      title: input.title.trim(),
      artist: input.artist?.trim() || null,
      audio_url: input.audio_url,
      preview_url: input.preview_url ?? input.audio_url,
      duration_sec: input.duration_sec ?? null,
      cover_url: input.cover_url ?? null,
      uploaded_by: input.uploaded_by ?? null,
      genre: input.genre?.trim() || null,
      mood: input.mood?.trim() || null,
      source_type: input.source_type ?? (input.uploaded_by ? 'extracted' : 'licensed'),
      source_reel_id: input.source_reel_id ?? null,
      is_active: true,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ReelSoundRow;
}

export async function deactivateReelSoundForUser(
  soundId: string,
  profileId: string
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('reel_sounds')
    .select('id, uploaded_by')
    .eq('id', soundId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Sound not found');
  if (data.uploaded_by !== profileId) throw new Error('Not allowed');

  const { error: updateErr } = await supabaseAdmin
    .from('reel_sounds')
    .update({ is_active: false })
    .eq('id', soundId);
  if (updateErr) throw new Error(updateErr.message);
}
