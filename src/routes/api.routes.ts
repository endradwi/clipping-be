import { Elysia } from 'elysia';
import { heatmapController } from '../controllers/heatmap.controller';
import { clipController } from '../controllers/clip.controller';
import { settingsController } from '../controllers/settings.controller';

export const apiRoutes = new Elysia({ prefix: '/api/v1' })
  // Heatmap & Analysis
  .post('/analyze', ({ body }) => heatmapController.analyzeVideo({ body }))
  .post('/upload/presign', ({ body }) => heatmapController.getPresignedUploadUrl({ body }))
  .post('/upload/direct', ({ request }) => heatmapController.uploadDirectFallback({ request }))
  .post('/analyze/upload', ({ body }) => heatmapController.analyzeUploadedVideo({ body }))

  // Clip Rendering & Progress
  .post('/clips/render', ({ body }) => clipController.triggerRender({ body }))
  .get('/clips/history', ({ query }) => clipController.getHistory({ query }))
  .get('/clips/:id', ({ params }) => clipController.getJob({ params }))
  .get('/clips/:id/progress', ({ params }) => clipController.streamProgress({ params }))
  .get('/clips/:id/download', ({ params, set }) => clipController.downloadClip({ params, set }))

  // BYOK Settings
  .get('/settings', () => settingsController.getSettingsStatus())
  .post('/settings', ({ body, set }) => settingsController.saveSettings({ body, set }))

  // YouTube Cookies (Anti-Bot Bypass)
  .get('/cookies', () => settingsController.getCookiesStatus())
  .post('/cookies', ({ body }) => settingsController.saveCookies({ body }));
