/**
 * Start Metro on 8082 + buffering proxy on 8081 for Android emulator.
 * Fixes Hermes "Compiling JS failed" caused by truncated chunked downloads.
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

function run(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => {
    if (code && code !== 0) process.exit(code);
  });
  return child;
}

// Free common ports from stale processes (best-effort).
try {
  require('child_process').execSync('node scripts/adb-reverse.js', {
    cwd: root,
    stdio: 'inherit',
  });
} catch {
  // adb may be offline; continue
}

console.log('[start:emu] Metro on 8082, buffering proxy on 8081…');
console.log('[start:emu] After Metro is ready, open the app with:');
console.log(
  '  adb shell am start -a android.intent.action.VIEW -d "chatapp://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081"'
);

const metro = run(
  'npx',
  ['expo', 'start', '--dev-client', '--lan', '--port', '8082', '--clear'],
  { EXPO_NO_METRO_LAZY: '1' }
);

// Wait until Metro accepts connections before starting the proxy.
function waitForMetro(attempt = 0) {
  const http = require('http');
  const req = http.get(
    { hostname: '127.0.0.1', port: 8082, path: '/status', timeout: 2000 },
    (res) => {
      res.resume();
      console.log('[start:emu] Metro is up — starting proxy');
      run('node', ['scripts/metro-buffer-proxy.js'], {
        PROXY_PORT: '8081',
        METRO_UPSTREAM_PORT: '8082',
      });
    }
  );
  req.on('error', () => {
    if (attempt > 90) {
      console.error('[start:emu] Metro did not start in time');
      process.exit(1);
    }
    setTimeout(() => waitForMetro(attempt + 1), 1000);
  });
}

setTimeout(() => waitForMetro(), 2000);

function shutdown() {
  try {
    metro.kill('SIGTERM');
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
