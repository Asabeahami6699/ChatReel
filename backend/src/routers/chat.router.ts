/**
 * Phase 2 soft split — chat surface (same URL paths as before).
 * Mount via app.use('/api', chatRouter) or keep individual mounts.
 */
import { Router } from 'express';
import chatsRoutes from '../routes/chats.routes';
import chatSettingsRoutes from '../routes/chat-settings.routes';
import keysRoutes from '../routes/keys.routes';
import messagesRoutes from '../routes/messages.routes';
import notificationsRoutes from '../routes/notifications.routes';
import uploadsRoutes from '../routes/uploads.routes';

const chatRouter = Router();

chatRouter.use('/messages', messagesRoutes);
chatRouter.use('/chats', chatsRoutes);
chatRouter.use('/chat-settings', chatSettingsRoutes);
chatRouter.use('/uploads', uploadsRoutes);
chatRouter.use('/keys', keysRoutes);
chatRouter.use('/notifications', notificationsRoutes);

export default chatRouter;
