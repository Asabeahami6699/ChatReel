import * as FileSystem from 'expo-file-system';

function toFilePath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export async function mergeVoiceSegments(uris: string[]): Promise<string | null> {
  if (uris.length === 0) return null;
  if (uris.length === 1) return uris[0];

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return uris[uris.length - 1];

  const outputPath = `${cacheDir}voice-merged-${Date.now()}.m4a`;
  try {
    const { concatAudioFiles } = require('react-native-audio-concat') as typeof import('react-native-audio-concat');
    const data = uris.map((uri) => ({ filePath: toFilePath(uri) }));
    const result = await concatAudioFiles(data, toFilePath(outputPath));
    return toFileUri(result);
  } catch (error) {
    console.warn(
      'Voice segment merge unavailable — rebuild the dev client after installing react-native-audio-concat.',
      error
    );
    return uris[uris.length - 1];
  }
}
