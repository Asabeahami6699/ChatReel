/** Web: use the browser Clipboard API (no expo-clipboard needed). */
export async function setStringAsync(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('Clipboard not available in this browser');
}
