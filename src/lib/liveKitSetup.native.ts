/** Safe on Expo Go — calls need a dev build (`npm run android`). */
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerGlobals } = require('@livekit/react-native') as {
    registerGlobals: () => void;
  };
  registerGlobals();
} catch (err) {
  if (__DEV__) {
    console.warn(
      '[liveKit] Native module not loaded. Use a development build for calls:',
      (err as Error)?.message ?? err
    );
  }
}
