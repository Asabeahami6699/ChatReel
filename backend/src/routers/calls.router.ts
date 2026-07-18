/**
 * Phase 2 soft split — calls surface (ready to extract to its own deploy later).
 */
import { Router } from 'express';
import callsRoutes from '../routes/calls.routes';

const callsRouter = Router();
callsRouter.use(callsRoutes);

export default callsRouter;
