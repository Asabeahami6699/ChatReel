import type { PushPayload } from '../services/push.service';
import { enqueueJob, registerJobHandler } from './jobQueue';

let handlersRegistered = false;

export function registerPushQueueHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  registerJobHandler('push', async (job) => {
    const { sendPushToUsers } = await import('../services/push.service');
    const userIds = job.payload.userIds as string[];
    const payload = job.payload.payload as PushPayload;
    await sendPushToUsers(userIds, payload);
  });
}

/** Enqueue Expo push (or process inline via memory queue). */
export function enqueuePushToUsers(userIds: string[], payload: PushPayload): void {
  registerPushQueueHandlers();
  void enqueueJob('push', { userIds, payload });
}

export function enqueuePushToUser(userId: string, payload: PushPayload): void {
  enqueuePushToUsers([userId], payload);
}
