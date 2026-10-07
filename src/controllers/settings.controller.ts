import { SaveSettingsSchema } from '../models/settings.model';
import { successResponse, errorResponse } from '../views/response.view';
import { join } from 'node:path';

const cookiesFilePath = join(process.cwd(), 'cookies.txt');

export class SettingsController {
  public saveSettings({ body, set }: { body: any; set: any }) {
    const parse = SaveSettingsSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.errors[0]?.message || 'Invalid settings', 'VALIDATION_ERROR', 422);
    }

    const payload = JSON.stringify(parse.data);
    const encoded = Buffer.from(payload).toString('base64');

    // Set secure HttpOnly cookie
    set.headers['Set-Cookie'] = `byok_creds=${encoded}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;

    return successResponse({
      message: 'BYOK credentials saved securely in HttpOnly cookie'
    });
  }

  public getSettingsStatus() {
    return successResponse({
      hasCustomKey: false,
      activeRouterUrl: process.env.AI_ROUTER_BASE_URL || 'https://router.endra.web.id/v1',
      defaultModel: process.env.AI_MODEL_CHAT || 'gemini/gemini-3.7-flash',
      hasGroqFallback: !!process.env.GROQ_API_KEY
    });
  }

  public async saveCookies({ body }: { body: any }) {
    const { cookies } = body || {};
    if (!cookies || typeof cookies !== 'string') {
      return errorResponse('Valid cookies string required', 'BAD_REQUEST', 400);
    }
    await Bun.write(cookiesFilePath, cookies.trim());
    return successResponse({ message: 'YouTube cookies.txt saved successfully' });
  }

  public async getCookiesStatus() {
    const exists = await Bun.file(cookiesFilePath).exists();
    return successResponse({ hasCookies: exists });
  }
}

export const settingsController = new SettingsController();
