import { logger } from '../common/logger';

export class AlertService {
  private botToken = process.env.TELEGRAM_ALERT_BOT_TOKEN;
  private chatId = process.env.TELEGRAM_ALERT_CHAT_ID || '1575704919';

  public extractClientInfo(request?: Request): { ip: string; device: string } {
    if (!request) {
      return { ip: 'Internal', device: 'Server' };
    }

    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'Unknown IP';

    const ua = request.headers.get('user-agent') || '';
    let device = 'Desktop / Unknown';
    if (/iphone/i.test(ua)) device = '📱 iPhone';
    else if (/android/i.test(ua)) device = '📱 Android';
    else if (/macintosh/i.test(ua)) device = '💻 Mac';
    else if (/windows/i.test(ua)) device = '💻 Windows';
    else if (/linux/i.test(ua)) device = '🐧 Linux';

    if (/chrome/i.test(ua) && !/edg/i.test(ua)) device += ' (Chrome)';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) device += ' (Safari)';
    else if (/edg/i.test(ua)) device += ' (Edge)';
    else if (/firefox/i.test(ua)) device += ' (Firefox)';

    return { ip, device };
  }

  public async sendAlert(text: string): Promise<void> {
    // Non-blocking fire & forget
    const token = this.botToken || process.env.TELEGRAM_ALERT_BOT_TOKEN;
    const chat = this.chatId || process.env.TELEGRAM_ALERT_CHAT_ID;
    if (!token || !chat) {
      logger.debug('Telegram alert skipped: token or chat_id not set');
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
    } catch (err: any) {
      logger.warn(`Failed to dispatch Telegram spy alert: ${err.message}`);
    }
  }

  public notifyUpload(filename: string, ip: string, device: string) {
    const time = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
    const msg =
      `🚨 <b>[CLIPPING SPY] FILE UPLOADED</b>\n\n` +
      `📁 <b>File:</b> <code>${filename}</code>\n` +
      `🌐 <b>IP:</b> <code>${ip}</code>\n` +
      `📱 <b>Device:</b> ${device}\n` +
      `⏰ <b>Waktu:</b> ${time} WIB`;
    this.sendAlert(msg);
  }

  public notifyAnalyze(target: string, durationSec: number | undefined, ip: string, device: string) {
    const time = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
    const dur = durationSec ? `${Math.floor(durationSec / 60)}m ${Math.floor(durationSec % 60)}s` : 'Unknown';
    const msg =
      `🚨 <b>[CLIPPING SPY] VIDEO ANALYZED</b>\n\n` +
      `🎬 <b>Target:</b> ${target}\n` +
      `⏱️ <b>Durasi:</b> ${dur}\n` +
      `🌐 <b>IP:</b> <code>${ip}</code>\n` +
      `📱 <b>Device:</b> ${device}\n` +
      `⏰ <b>Waktu:</b> ${time} WIB`;
    this.sendAlert(msg);
  }

  public notifyRenderStart(title: string, range: string, format: string, ip: string, device: string) {
    const time = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
    const msg =
      `🚨 <b>[CLIPPING SPY] RENDER STARTED</b>\n\n` +
      `✂️ <b>Klip:</b> ${title}\n` +
      `⏱️ <b>Rentang:</b> ${range}\n` +
      `📐 <b>Format:</b> ${format}\n` +
      `🌐 <b>IP:</b> <code>${ip}</code>\n` +
      `📱 <b>Device:</b> ${device}\n` +
      `⏰ <b>Waktu:</b> ${time} WIB`;
    this.sendAlert(msg);
  }

  public notifyRenderComplete(title: string, r2Url: string) {
    const time = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
    const msg =
      `✅ <b>[CLIPPING SPY] RENDER SUCCESS</b>\n\n` +
      `🎬 <b>Klip:</b> ${title}\n` +
      `🔗 <b>Link:</b> <a href="${r2Url}">Download Klip MP4</a>\n` +
      `⏰ <b>Waktu:</b> ${time} WIB`;
    this.sendAlert(msg);
  }
}

export const alertService = new AlertService();
