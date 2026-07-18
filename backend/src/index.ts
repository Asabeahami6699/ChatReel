import http from 'http';
import os from 'os';
import { createApp } from './app';
import { env, isLiveKitConfigured } from './config/env';
import { startMessageArchiveScheduler } from './jobs/archiveMessages';
import { startMomentCleanupScheduler, stopMomentCleanupScheduler } from './jobs/cleanupMoments';
import { startReelReconcileScheduler, stopReelReconcileScheduler } from './jobs/reconcileReels';
import { startJobWorkers, stopJobWorkers } from './lib/jobQueue';
import { registerPushQueueHandlers } from './lib/pushQueue';
import { attachChatWebSocket } from './realtime/wsGateway';

const app = createApp();
const server = http.createServer(app);

attachChatWebSocket(server);

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

server.listen(env.port, '0.0.0.0', () => {
  console.log(`ChatApp API running on http://localhost:${env.port}`);
  console.log(`Health check: http://localhost:${env.port}/health`);
  console.log(`WebSocket: ws://localhost:${env.port}${env.wsPath}`);
  for (const ip of getLanAddresses()) {
    console.log(`Phone (same Wi-Fi): http://${ip}:${env.port}/health`);
  }
  console.log(`[calls] LiveKit ${isLiveKitConfigured() ? 'ENABLED' : 'DISABLED'}`);
  console.log(`[calls] max concurrent / user = ${env.maxConcurrentCalls}`);
  console.log(`[phase3] region=${env.regionId} e2e=${env.e2eMode}`);
  if (env.mediaCdnUrl || env.reelsCdnUrl) {
    console.log(`[media] CDN = ${env.mediaCdnUrl || env.reelsCdnUrl}`);
  }
  registerPushQueueHandlers();
  void startJobWorkers();
  startMessageArchiveScheduler();
  startReelReconcileScheduler();
  startMomentCleanupScheduler();
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — stopping schedulers`);
  stopReelReconcileScheduler();
  stopMomentCleanupScheduler();
  void stopJobWorkers();
  server.close(() => process.exit(0));
  // Fallback if open sockets keep the server from closing.
  setTimeout(() => process.exit(0), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
