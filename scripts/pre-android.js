/**
 * Ensure Metro uses one port before `expo run:android`.
 * Warns when 8081/8082 are already taken (common cause of Hermes "invalid expression").
 */
const { execSync } = require('child_process');

const PORT = Number(process.env.RCT_METRO_PORT ?? process.env.EXPO_DEV_SERVER_PORT ?? 8081);

function portsInUseOnWindows(ports) {
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8' });
    const inUse = new Set();
    for (const line of out.split('\n')) {
      for (const port of ports) {
        if (line.includes(`:${port} `) && line.includes('LISTENING')) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && pid !== '0') inUse.add(Number(pid));
        }
      }
    }
    return [...inUse];
  } catch {
    return [];
  }
}

function listDevices() {
  try {
    const out = execSync('adb devices', { encoding: 'utf8' });
    return out
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('*'))
      .filter((l) => l.endsWith('device'));
  } catch {
    return [];
  }
}

const busy = portsInUseOnWindows([8081, 8082]);
if (busy.length > 0) {
  console.warn(
    `[pre-android] Ports 8081/8082 may be in use (PIDs: ${busy.join(', ')}). ` +
      'Stop other `expo start` / Metro windows first, or Hermes may show a red screen.'
  );
}

const devices = listDevices();
if (devices.length > 0) {
  for (const line of devices) {
    const serial = line.split(/\s+/)[0];
    try {
      execSync(`adb -s ${serial} reverse tcp:${PORT} tcp:${PORT}`, { stdio: 'inherit' });
      console.log(`[pre-android] ${serial}: reverse tcp:${PORT} → PC`);
    } catch {
      console.warn(`[pre-android] adb reverse failed for ${serial}`);
    }
  }
} else {
  console.log('[pre-android] No adb device yet (emulator may start during build).');
}

console.log(`[pre-android] Metro port ${PORT}`);
