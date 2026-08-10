/**
 * Identify song title/artist via AudD.
 * Prefers a public audio URL (simplest).
 * Set AUDD_API_TOKEN in backend .env — https://dashboard.audd.io/
 * Without the token, extract still works with a fallback title.
 */
export type MusicIdentity = {
  title: string;
  artist: string | null;
  album?: string | null;
};

export async function identifyMusicFromUrl(
  audioUrl: string
): Promise<MusicIdentity | null> {
  const token = process.env.AUDD_API_TOKEN?.trim();
  if (!token) return null;

  try {
    const form = new FormData();
    form.append('api_token', token);
    form.append('url', audioUrl);
    form.append('return', 'apple_music,spotify');

    const res = await fetch(
      'https://api.audd.io/',
      { method: 'POST', body: form } as unknown as RequestInit
    );
    if (!res.ok) {
      console.warn('[musicIdentify] AudD HTTP', res.status);
      return null;
    }

    const json = (await res.json()) as {
      status?: string;
      result?: { title?: string; artist?: string; album?: string } | null;
    };

    if (json.status !== 'success' || !json.result?.title) return null;

    return {
      title: String(json.result.title).trim(),
      artist: json.result.artist ? String(json.result.artist).trim() : null,
      album: json.result.album ? String(json.result.album).trim() : null,
    };
  } catch (err) {
    console.warn('[musicIdentify] failed', err);
    return null;
  }
}
