// Cookie encryption & parsing for BYOK credentials
export interface EncryptedSettings {
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  groqApiKey?: string;
}

export function parseCredentialsFromHeaders(headers: Record<string, string | undefined>): EncryptedSettings {
  return {
    aiBaseUrl: headers['x-ai-base-url'] || process.env.AI_ROUTER_BASE_URL,
    aiApiKey: headers['x-ai-api-key'] || process.env.AI_ROUTER_API_KEY,
    aiModel: headers['x-ai-model'] || process.env.AI_MODEL_CHAT || 'gemini/gemini-3.7-flash',
    groqApiKey: headers['x-groq-api-key'] || process.env.GROQ_API_KEY
  };
}
