/**
 * Bulk-import licensed reel sounds from backend/data/reel-sounds-seed.json.
 *
 * Usage (from backend/):
 *   npx tsx scripts/seed-reel-sounds.ts
 *
 * Replace audio_url values with your Supabase storage URLs before production.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

type SeedTrack = {
  title: string;
  artist: string;
  audio_url: string;
  preview_url?: string;
  duration_sec?: number;
  genre?: string;
  mood?: string;
  cover_url?: string;
};

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const supabase = createClient(url, key);
const manifestPath = path.join(__dirname, '..', 'data', 'reel-sounds-seed.json');
const tracks = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SeedTrack[];

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const track of tracks) {
    const { data: existing } = await supabase
      .from('reel_sounds')
      .select('id')
      .eq('title', track.title)
      .eq('artist', track.artist)
      .maybeSingle();

    if (existing?.id) {
      skipped += 1;
      continue;
    }

    const { error } = await supabase.from('reel_sounds').insert({
      title: track.title,
      artist: track.artist,
      audio_url: track.audio_url,
      preview_url: track.preview_url ?? track.audio_url,
      duration_sec: track.duration_sec ?? null,
      genre: track.genre ?? null,
      mood: track.mood ?? null,
      cover_url: track.cover_url ?? null,
      source_type: 'licensed',
      is_active: true,
    });

    if (error) {
      console.error(`Failed to insert "${track.title}":`, error.message);
      process.exitCode = 1;
      continue;
    }
    inserted += 1;
  }

  console.log(`Done. Inserted ${inserted}, skipped ${skipped} (already present).`);
}

void main();
