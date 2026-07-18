import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, getCorsMiddlewareOptions } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import profilesRoutes from './routes/profiles.routes';
import friendshipsRoutes from './routes/friendships.routes';
import groupsRoutes from './routes/groups.routes';
import qrRoutes from './routes/qr.routes';
import reelsRoutes from './routes/reels.routes';
import momentsRoutes from './routes/moments.routes';
import giftsRoutes from './routes/gifts.routes';
import walletRoutes from './routes/wallet.routes';
import paystackWebhookRoutes from './routes/paystack.webhook.routes';
import linkPreviewRoutes from './routes/linkpreview.routes';
import ringtonesRoutes from './routes/ringtones.routes';
import chatRouter from './routers/chat.router';
import callsRouter from './routers/calls.router';
import realtimeRoutes from './routes/realtime.routes';
import { incSloMetric } from './lib/sloMetrics';

export function createApp() {
  const app = express();

  const corsOptions = getCorsMiddlewareOptions();
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use('/api/wallet', paystackWebhookRoutes);
  app.use(express.json({ limit: '25mb' }));
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'tiny'));
  app.use((_req, _res, next) => {
    incSloMetric('http_requests');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      region: env.regionId,
      e2e_mode: env.e2eMode,
      services: { chat: true, calls: true, ws: true },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/profiles', profilesRoutes);
  app.use('/api/friendships', friendshipsRoutes);
  app.use('/api/groups', groupsRoutes);

  // Phase 2: chat vs calls soft-split (paths unchanged for clients).
  app.use('/api', chatRouter);
  app.use('/api/calls', callsRouter);

  // Phase 3: devices, sync, WS/SLO metrics
  app.use('/api/realtime', realtimeRoutes);

  app.use('/api/qr', qrRoutes);
  app.use('/api/reels', reelsRoutes);
  app.use('/api/moments', momentsRoutes);
  app.use('/api/gifts', giftsRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/ringtones', ringtonesRoutes);
  app.use('/api/link-preview', linkPreviewRoutes);

  app.use(errorHandler);

  return app;
}
