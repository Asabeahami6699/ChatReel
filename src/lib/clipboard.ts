import * as Clipboard from 'expo-clipboard';

export async function setStringAsync(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
