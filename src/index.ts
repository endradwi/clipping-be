import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { apiRoutes } from './routes/api.routes';
import { logger } from './common/logger';

const port = Number(process.env.PORT) || 3000;

export const app = new Elysia()
  .use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  }))
  .onError(({ code, error, set }) => {
    logger.error(`Unhandled Error [${code}]:`, error);
    set.status = (code === 'NOT_FOUND') ? 404 : 500;
    return {
      success: false,
      error: {
        code,
        message: error.message || 'Internal Server Error'
      }
    };
  })
  .get('/health', () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'clipping-be'
  }))
  .use(apiRoutes)
  .listen(port);

logger.info(`🦊 Cheat-Clip API is running at http://localhost:${port}`);

export type App = typeof app;
