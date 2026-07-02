import os from 'os';
import { createApp } from './app';
import { env, isLiveKitConfigured } from './config/env';

const app = createApp();

function getLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const addrs: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        addrs.push(net.address);
      }
    }
  }
  return addrs;
}

app.listen(env.port, '0.0.0.0', () => {
  console.log(`ChatApp API running on http://localhost:${env.port}`);
  console.log(`Health check: http://localhost:${env.port}/health`);
  for (const ip of getLanAddresses()) {
    console.log(`Phone (same Wi-Fi): http://${ip}:${env.port}/health`);
  }
  console.log(`[calls] LiveKit ${isLiveKitConfigured() ? 'ENABLED' : 'DISABLED'}`);
});
