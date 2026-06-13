import { GoogleGenAI, Type } from '@google/genai';

/** Nano Banana image models (Gemini native image generation). */
export const GEMINI_IMAGE_MODEL_FREE = 'gemini-2.5-flash-image';
export const GEMINI_IMAGE_MODEL_PRO = 'gemini-3.1-flash-image-preview';
export const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';

export type AiTier = 'free' | 'pro';

export const getApiKey = (): string | undefined =>
  process.env.API_KEY || process.env.GEMINI_API_KEY;

export const getGeminiClient = (): GoogleGenAI => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API Key not found.');
  return new GoogleGenAI({ apiKey });
};

export const imageModelForTier = (tier: AiTier) =>
  tier === 'free' ? GEMINI_IMAGE_MODEL_FREE : GEMINI_IMAGE_MODEL_PRO;

export const doorImageConfig = (tier: AiTier) =>
  tier === 'free'
    ? { aspectRatio: '9:16' as const }
    : { aspectRatio: '9:16' as const, imageSize: '4K' as const };

export const extractInlineImage = (response: any) => {
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return { data: part.inlineData.data, mimeType: part.inlineData.mimeType };
    }
  }
  return null;
};

export const wooContentSchema = {
  responseMimeType: 'application/json' as const,
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      excerpt: { type: Type.STRING },
      description: { type: Type.STRING },
    },
    required: ['title', 'excerpt', 'description'],
  },
};
