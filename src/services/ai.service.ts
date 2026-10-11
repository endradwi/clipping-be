import OpenAI, { toFile } from 'openai';
import { logger } from '../common/logger';
import { EncryptedSettings } from '../common/cookies';

export class AiService {
  private defaultRouterClient: OpenAI;
  private defaultGroqClient: OpenAI | null = null;

  constructor() {
    this.defaultRouterClient = new OpenAI({
      baseURL: process.env.AI_ROUTER_BASE_URL || 'https://router.endra.web.id/v1',
      apiKey: process.env.AI_ROUTER_API_KEY || 'sk-9router'
    });

    if (process.env.GROQ_API_KEY) {
      this.defaultGroqClient = new OpenAI({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY
      });
    }
  }

  // Cascading execution: User custom -> 9Router Primary -> Groq Fallback
  public async generateViralHooks(
    transcriptSnippet: string,
    customCreds?: EncryptedSettings
  ): Promise<{ title: string; hook: string; hashtags: string[] }> {
    const prompt = `You are an elite short-form video editor. Given this 30s video transcript segment:
"${transcriptSnippet}"

Provide:
1. Viral Hook (Max 8 words, attention-grabbing for TikTok/Reels)
2. Short Punchy Video Title
3. 3-5 relevant hashtags

Respond ONLY in JSON format:
{"hook": "...", "title": "...", "hashtags": ["#tag1", "#tag2"]}`;

    const client = customCreds?.aiApiKey
      ? new OpenAI({ baseURL: customCreds.aiBaseUrl || 'https://router.endra.web.id/v1', apiKey: customCreds.aiApiKey })
      : this.defaultRouterClient;

    const model = customCreds?.aiModel || process.env.AI_MODEL_CHAT || 'gemini/gemini-3.7-flash';

    try {
      logger.info(`Generating viral hook via AI model: ${model}`);
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      });
      const content = res.choices[0]?.message?.content || '{}';
      return JSON.parse(content);
    } catch (err: any) {
      logger.warn(`Primary AI call failed (${err.message}). Trying Groq fallback...`);
      if (this.defaultGroqClient) {
        try {
          const res = await this.defaultGroqClient.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
          });
          const content = res.choices[0]?.message?.content || '{}';
          return JSON.parse(content);
        } catch (fbErr: any) {
          logger.error(`Groq fallback failed: ${fbErr.message}`);
        }
      }
      return {
        hook: "Must-watch moment!",
        title: "Trending Highlight",
        hashtags: ["#shorts", "#viral", "#clip"]
      };
    }
  }

  // Transcribe audio using Groq LPU Whisper (returns text & timestamped segments)
  public async transcribeAudioWithSegments(audioFilePath: string, timeOffset: number = 0): Promise<{ text: string; segments: Array<{ start: number; duration: number; text: string }> }> {
    if (!this.defaultGroqClient) {
      logger.warn('Groq client not configured, skipping Whisper transcription');
      return { text: '', segments: [] };
    }

    try {
      logger.info(`Transcribing audio via Groq Whisper LPU: ${audioFilePath} (offset=${timeOffset}s)`);
      const file = Bun.file(audioFilePath);
      const fileBytes = await file.arrayBuffer();
      const uploadable = await toFile(Buffer.from(fileBytes), 'audio.mp3', { type: 'audio/mpeg' });
      const transcription: any = await this.defaultGroqClient.audio.transcriptions.create({
        file: uploadable,
        model: 'whisper-large-v3',
        response_format: 'verbose_json'
      });

      const segments = (transcription.segments || []).map((s: any) => ({
        start: Number(s.start || 0) + timeOffset,
        duration: Math.max(0.5, Number(s.end || 0) - Number(s.start || 0)),
        text: String(s.text || '').trim()
      }));

      return {
        text: transcription.text || '',
        segments
      };
    } catch (err: any) {
      logger.error(`Groq Whisper transcription failed: ${err.message}`);
      return { text: '', segments: [] };
    }
  }

  // Transcribe audio using Groq LPU Whisper (0.8s execution)
  public async transcribeAudio(audioFilePath: string): Promise<string> {
    if (!this.defaultGroqClient) {
      logger.warn('Groq client not configured, skipping Whisper transcription');
      return '';
    }

    try {
      logger.info(`Transcribing audio via Groq Whisper LPU: ${audioFilePath}`);
      const file = Bun.file(audioFilePath);
      const fileBytes = await file.arrayBuffer();
      const uploadable = await toFile(Buffer.from(fileBytes), 'audio.mp3', { type: 'audio/mpeg' });
      const transcription = await this.defaultGroqClient.audio.transcriptions.create({
        file: uploadable,
        model: 'whisper-large-v3',
        response_format: 'verbose_json'
      });
      return transcription.text || '';
    } catch (err: any) {
      logger.error(`Groq Whisper transcription failed: ${err.message}`);
      return '';
    }
  }
}

export const aiService = new AiService();
