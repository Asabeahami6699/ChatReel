import { env } from '../config/env';
import { incSloMetric } from './sloMetrics';

export type JobKind = 'push' | 'ws_fanout';

export type Job = {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  createdAt: number;
};

type Handler = (job: Job) => Promise<void>;

type RedisLike = {
  lpush: (key: string, value: string) => Promise<unknown>;
  brpop: (key: string, timeout: number) => Promise<[string, string] | null>;
  quit: () => Promise<unknown>;
  on: (ev: string, fn: (...a: unknown[]) => void) => void;
};

const handlers = new Map<JobKind, Handler>();
const memoryQueue: Job[] = [];
let draining = false;
let redisClient: RedisLike | null = null;
let redisTried = false;
let workerStop = false;

const QUEUE_KEY = 'chatreel:jobs';

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function registerJobHandler(kind: JobKind, handler: Handler) {
  handlers.set(kind, handler);
}

async function tryConnectRedis(): Promise<boolean> {
  if (!env.redisUrl) return false;
  if (redisClient) return true;
  if (redisTried && !redisClient) return false;
  redisTried = true;
  try {
    const mod = (await import('ioredis')) as {
      default: new (url: string) => RedisLike;
    };
    const client = new mod.default(env.redisUrl);
    client.on('error', (err: unknown) => {
      console.warn('[queue] redis error', err instanceof Error ? err.message : err);
    });
    redisClient = client;
    console.log('[queue] Redis connected');
    return true;
  } catch (err) {
    console.warn(
      '[queue] REDIS_URL set but ioredis unavailable — using memory queue.',
      err instanceof Error ? err.message : err
    );
    redisClient = null;
    return false;
  }
}

async function processJob(job: Job) {
  const handler = handlers.get(job.kind);
  if (!handler) {
    console.warn('[queue] no handler for', job.kind);
    return;
  }
  try {
    await handler(job);
    incSloMetric('queue_processed');
  } catch (err) {
    incSloMetric('queue_failed');
    console.warn('[queue] job failed', job.kind, err);
  }
}

async function drainMemory() {
  if (draining) return;
  draining = true;
  try {
    while (memoryQueue.length) {
      const job = memoryQueue.shift();
      if (job) await processJob(job);
    }
  } finally {
    draining = false;
  }
}

async function redisWorkerLoop() {
  while (!workerStop && redisClient) {
    try {
      const popped = await redisClient.brpop(QUEUE_KEY, 5);
      if (!popped) continue;
      const job = JSON.parse(popped[1]) as Job;
      await processJob(job);
    } catch (err) {
      if (workerStop) break;
      console.warn('[queue] redis worker', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function enqueueJob(kind: JobKind, payload: Record<string, unknown>): Promise<void> {
  const job: Job = { id: makeId(), kind, payload, createdAt: Date.now() };
  incSloMetric('queue_enqueued');

  const useRedis = await tryConnectRedis();
  if (useRedis && redisClient) {
    await redisClient.lpush(QUEUE_KEY, JSON.stringify(job));
    return;
  }

  memoryQueue.push(job);
  void drainMemory();
}

export async function startJobWorkers() {
  workerStop = false;
  const useRedis = await tryConnectRedis();
  if (useRedis) {
    void redisWorkerLoop();
    console.log('[queue] Redis worker started');
  } else {
    console.log('[queue] memory queue (set REDIS_URL + npm i ioredis for shared queue)');
  }
}

export async function stopJobWorkers() {
  workerStop = true;
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      /* ignore */
    }
    redisClient = null;
  }
}

export function queueBackend(): 'redis' | 'memory' {
  return redisClient ? 'redis' : 'memory';
}
