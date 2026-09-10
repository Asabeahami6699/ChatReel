const path = require('path');
const projectRoot = __dirname;

// Metro's web dev bundle injects EXPO_PUBLIC_* from process.env at serialize time.
// Load .env here so the Metro process always has them (not only in app.config.js).
require('@expo/env').load(projectRoot);

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(projectRoot);

// Windows FileStore/BinaryFileStore has been serving corrupt Android reloads
// that Hermes reports as "Compiling JS failed" / "';' expected" (often logged
// by Metro as "Android Bundled … (1 module)"). Skip persistent transform cache.
config.cacheStores = [];

config.transformer = {
  ...config.transformer,
  // Expo entry — keeps babel-preset-expo / reanimated transforms intact for non-SVGs.
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  blockList: [
    ...(Array.isArray(config.resolver.blockList)
      ? config.resolver.blockList
      : config.resolver.blockList
        ? [config.resolver.blockList]
        : []),
    /\.expo-tmp-bundle[^/]*$/,
    /[/\\]test\.hbc$/,
    // MediaPipe uses dynamic import() Metro cannot transform — load from CDN instead
    /node_modules[/\\]@mediapipe[/\\]tasks-vision[/\\].*/,
  ],
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === '@mediapipe/tasks-vision') {
      return { type: 'empty' };
    }
    if (moduleName === 'hls.js' || moduleName === 'hls.js/dist/hls.js') {
      return {
        filePath: path.resolve(projectRoot, 'node_modules/hls.js/dist/hls.js'),
        type: 'sourceFile',
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
