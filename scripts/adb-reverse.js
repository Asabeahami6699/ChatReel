/**
 * USB-connected Android: map phone localhost → PC so dev client can reach Metro (8081) and the API.
 * Run: npm run adb:reverse
 *
 * Override target: set ANDROID_SERIAL=097785432V004918
 * Override API port: set PORT=3002 (must match backend/.env and EXPO_PUBLIC_API_URL)
 */
const { execSync } = require('child_process');

const apiPort = Number(process.env.PORT ?? process.env.EXPO_PUBLIC_API_URL?.match(/:(\d+)\/?$/)?.[1] ?? 3002);
const ports = [8081, apiPort];

function listDevices() {
  const out = execSync('adb devices', { encoding: 'utf8' });
  return out
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('*'))
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    })
    .filter((d) => d.serial && d.state === 'device');
}

function pickSerial(devices) {
  if (process.env.ANDROID_SERIAL) {
    return process.env.ANDROID_SERIAL;
  }
  if (devices.length === 0) {
    return null;
  }
  if (devices.length === 1) {
    return devices[0].serial;
  }
  // Prefer physical USB device over emulator when both are connected.
  const physical = devices.find((d) => !d.serial.startsWith('emulator-'));
  if (physical) {
    console.log(`[adb] Multiple devices — using phone ${physical.serial}`);
    if (devices.length > 1) {
      console.log(
        `[adb] Others: ${devices
          .filter((d) => d.serial !== physical.serial)
          .map((d) => d.serial)
          .join(', ')}`
      );
    }
    return physical.serial;
  }
  console.log(`[adb] Multiple emulators — using ${devices[0].serial}`);
  return devices[0].serial;
}

const devices = listDevices();
const serial = pickSerial(devices);

if (!serial) {
  console.error('[adb] No device found. Connect your phone with USB debugging enabled.');
  process.exit(1);
}

const adbTarget = `-s ${serial}`;

for (const port of ports) {
  try {
    execSync(`adb ${adbTarget} reverse tcp:${port} tcp:${port}`, { stdio: 'inherit' });
    console.log(`[adb] ${serial}: reverse tcp:${port} → PC`);
  } catch {
    console.warn(`[adb] failed for port ${port} on ${serial}`);
    process.exitCode = 1;
  }
}
