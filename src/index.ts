import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { apiRoutes } from './routes/api.routes';
import { logger } from './common/logger';
import { join } from 'node:path';

const port = Number(process.env.PORT) || 3000;
const frontendBuildDir = join(import.meta.dir, '../../frontend/build');

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
  .all('*', async ({ request, set }) => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname.startsWith('/api') || pathname.startsWith('/health')) {
      set.status = 404;
      return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } };
    }

    const target = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const file = Bun.file(join(frontendBuildDir, target));
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback
    const indexFile = Bun.file(join(frontendBuildDir, 'index.html'));
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    set.status = 404;
    return 'Not Found';
  })
  .listen(port);

logger.info(`🦊 Clipping is running at http://localhost:${port}`);

export type App = typeof app;
