export const DEFAULT_CHAT_MODEL: string = 'grok-2-vision';

export interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  // NOTE: The IDs here MUST match the keys used in lib/ai/providers.ts

  // xAI Grok
  {
    id: 'grok-2-vision',
    name: 'Grok 2 Vision',
    description: 'Grok model with vision capabilities',
  },
  {
    id: 'grok-3-mini-reasoning',
    name: 'Grok 3 Mini (Reasoning)',
    description: 'Grok 3 Mini optimized for reasoning',
  },

  // OpenAI
  {
    id: 'openai-gpt-4o',
    name: 'OpenAI GPT-4o',
    description: 'OpenAI flagship model',
  },
  {
    id: 'openai-gpt-4o-reasoning',
    name: 'OpenAI GPT-4o (Reasoning)',
    description: 'GPT-4o optimized for reasoning',
  },

  // Google Gemini
  {
    id: 'google-gemini-1.5-pro',
    name: 'Google Gemini 1.5 Pro',
    description: 'Google Pro model',
  },
  {
    id: 'google-gemini-1.5-pro-reasoning',
    name: 'Google Gemini 1.5 Pro (Reasoning)',
    description: 'Gemini 1.5 Pro optimized for reasoning',
  },
];
