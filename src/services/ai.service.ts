import OpenAI, { toFile } from 'openai';
import { logger } from '../common/logger';
import { EncryptedSettings } from '../common/cookies';
import { ClipRecommendation } from '../models/heatmap.model';

export class AiService {
  private defaultRouterClient: OpenAI;
  private defaultGroqClient: OpenAI | null = null;

  constructor() {
    this.defaultRouterClient = new OpenAI({
      baseURL: process.env.AI_ROUTER_BASE_URL || 'http://127.0.0.1:20128/v1',
      apiKey: process.env.AI_ROUTER_API_KEY || 'sk-9router',
      maxRetries: 0,
      timeout: 3000
    });

    if (process.env.GROQ_API_KEY) {
      this.defaultGroqClient = new OpenAI({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY,
        maxRetries: 0,
        timeout: 3000
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

  // Generate platform-specific metadata & campaign brief compliance recommendations
  public async generatePlatformRecommendations(
    transcriptSnippet: string,
    brief?: string,
    videoTitle?: string,
    customCreds?: EncryptedSettings
  ): Promise<ClipRecommendation> {
    const prompt = `You are a world-class viral short-form video editor and campaign strategist for TikTok, YouTube Shorts, and Instagram Reels.

Given the spoken dialogue snippet of this clip:
"${(transcriptSnippet || '').slice(0, 1200)}"
Video Context / Title: "${videoTitle || 'General Video'}"
${brief ? `\nCAMPAIGN BRIEF & COMPLIANCE REQUIREMENTS:\n${brief}\n` : ''}

Generate tailored, platform-specific metadata that maximizes algorithm retention and strictly follows any brief guidelines:
1. TikTok:
   - "title": Short punchy hook (under 40 chars)
   - "caption": Engaging 1-2 sentence hook caption with curiosity gap
   - "hashtags": Array of 4-6 hashtags (include any mandatory campaign tags from brief)
   - "tips": 1 practical tip (audio sound, visual hook, or optimal posting tactic)
2. YouTube Shorts:
   - "title": Highly clickable title STRICTLY UNDER 50 CHARACTERS (so it never truncates on mobile Shorts feed)
   - "description": Concise description (1-2 sentences)
   - "hashtags": Array of 3-5 hashtags (must include "#shorts")
3. Instagram Reels:
   - "hook": First-line grabber
   - "caption": Value-driven caption with a clear Call-to-Action (CTA) e.g., "Save this for later" or "Link in bio"
   - "hashtags": Array of 5-8 relevant hashtags
   - "callToAction": One concise CTA sentence
${brief ? `4. Brief Compliance:
   - "matched": true or false (does this clip adhere to the brief and avoid prohibited topics?)
   - "reason": 1 clear sentence explaining how this clip complies with the brief or any caveats` : ''}

Respond ONLY in valid JSON format matching:
{
  "tiktok": {
    "title": "...",
    "caption": "...",
    "hashtags": ["#tag1", "#tag2"],
    "tips": "..."
  },
  "youtubeShorts": {
    "title": "...",
    "description": "...",
    "hashtags": ["#shorts", "#tag1"]
  },
  "instagramReels": {
    "hook": "...",
    "caption": "...",
    "hashtags": ["#tag1", "#tag2"],
    "callToAction": "..."
  }${brief ? `,
  "briefCompliance": {
    "matched": true,
    "reason": "..."
  }` : ''}
}`;

    const client = customCreds?.aiApiKey
      ? new OpenAI({ baseURL: customCreds.aiBaseUrl || 'https://router.endra.web.id/v1', apiKey: customCreds.aiApiKey })
      : this.defaultRouterClient;

    const model = customCreds?.aiModel || process.env.AI_MODEL_CHAT || 'gemini/gemini-3.7-flash';

    const withAiTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI call timeout')), ms))
      ]);

    try {
      logger.info(`Generating platform recommendations via AI model: ${model}`);
      const res: any = await withAiTimeout(client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        stream: false
      }), 2000);
      const content = res.choices[0]?.message?.content || '{}';
      return JSON.parse(content);
    } catch (err: any) {
      logger.warn(`Primary AI recommendation call failed (${err.message}). Trying Groq fallback...`);
      if (this.defaultGroqClient) {
        try {
          const res: any = await withAiTimeout(this.defaultGroqClient.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            stream: false
          }), 2000);
          const content = res.choices[0]?.message?.content || '{}';
          return JSON.parse(content);
        } catch (fbErr: any) {
          logger.error(`Groq recommendation fallback failed: ${fbErr.message}`);
        }
      }

      const fallbackTitle = videoTitle ? videoTitle.slice(0, 42) : 'Highlight Menarik Hari Ini';
      return {
        tiktok: {
          title: fallbackTitle.slice(0, 38),
          caption: 'Tonton sampai habis, poin terakhir paling penting! 🔥',
          hashtags: ['#fyp', '#viral', '#trending', '#videopendek', '#tips'],
          tips: 'Gunakan sound trending dengan volume 10-15% sebagai background audio.'
        },
        youtubeShorts: {
          title: `${fallbackTitle.slice(0, 38)} #shorts`,
          caption: 'Momen penting yang wajib kamu tonton.',
          description: 'Momen penting yang wajib kamu tonton. Subscribe untuk video menarik lainnya!',
          hashtags: ['#shorts', '#viral', '#trending']
        },
        instagramReels: {
          title: fallbackTitle.slice(0, 38),
          hook: 'Pernah kepikiran hal ini nggak sebelumnya?',
          caption: 'Simpan video ini buat referensi nanti dan bagikan ke teman yang butuh info ini! 📌\n\nKomen pendapat kamu di bawah 👇',
          hashtags: ['#reels', '#viralreels', '#insight', '#fyp'],
          callToAction: 'Simpan video ini (Save) agar tidak hilang saat kamu butuh!'
        },
        briefCompliance: brief ? {
          matched: true,
          reason: 'Rekomendasi disesuaikan dengan transkrip video.'
        } : undefined
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
