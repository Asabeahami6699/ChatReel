import { supabaseAdmin } from '../lib/supabaseAdmin';

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
  created_at: string;
};

export async function listReelSounds(opts: {
  q?: string;
  limit?: number;
  trending?: boolean;
  uploadedByProfileId?: string;
}): Promise<ReelSoundRow[]> {
  const limit = Math.min(opts.limit ?? 30, 50);
  let query = supabaseAdmin
    .from('reel_sounds')
    .select('*')
    .eq('is_active', true)
    .limit(limit);

  if (opts.uploadedByProfileId) {
    query = query
      .eq('uploaded_by', opts.uploadedByProfileId)
      .order('created_at', { ascending: false });
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
        (s.artist?.toLowerCase().includes(q) ?? false)
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
      is_active: true,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ReelSoundRow;
}
