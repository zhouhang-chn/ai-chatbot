// Define the type based on the tuple
export type AvailableChatModelId = (typeof availableModelIds)[number];

// Keep DEFAULT_CHAT_MODEL, ensure it's one of the available IDs if possible
// If 'grok-2-vision' is no longer available, choose a new default from the list above.
// Let's default to 'openai-gpt-4o' for now.
export const DEFAULT_CHAT_MODEL: AvailableChatModelId = 'openai-gpt-4o';

// Add provider and baseModelId to the interface
export interface ChatModel {
  id: AvailableChatModelId; // Full ID (e.g., openai-gpt-4o)
  name: string;
  description: string;
  provider: 'openai' | 'google'; // Add other providers as needed
  baseModelId: string;         // Base ID for the provider (e.g., gpt-4o)
}

// Define the detailed model info array including provider and baseModelId
export const chatModels: Array<ChatModel> = [
  // OpenAI
  {
    id: 'openai-gpt-4.5-preview',
    name: 'OpenAI GPT-4.5 (Preview)',
    description: 'OpenAI preview model',
    provider: 'openai',
    baseModelId: 'gpt-4.5-preview',
  },
  {
    id: 'openai-o1-mini',
    name: 'OpenAI o1 Mini',
    description: 'OpenAI o1 Mini model',
    provider: 'openai',
    baseModelId: 'o1-mini',
  },
  {
    id: 'openai-o1-preview',
    name: 'OpenAI o1 (Preview)',
    description: 'OpenAI o1 preview model',
    provider: 'openai',
    baseModelId: 'o1-preview',
  },
  {
    id: 'openai-gpt-4o',
    name: 'OpenAI GPT-4o',
    description: 'OpenAI flagship model',
    provider: 'openai',
    baseModelId: 'gpt-4o',
  },
  {
    id: 'openai-gpt-4o-mini',
    name: 'OpenAI GPT-4o Mini',
    description: 'OpenAI GPT-4o Mini model',
    provider: 'openai',
    baseModelId: 'gpt-4o-mini',
  },
  {
    id: 'openai-gpt-4.1',
    name: 'OpenAI GPT-4.1',
    description: 'OpenAI GPT-4.1 model',
    provider: 'openai',
    baseModelId: 'gpt-4.1',
  },
  {
    id: 'openai-gpt-4.1-mini',
    name: 'OpenAI GPT-4.1 Mini',
    description: 'OpenAI GPT-4.1 Mini model',
    provider: 'openai',
    baseModelId: 'gpt-4.1-mini',
  },
  {
    id: 'openai-gpt-4.1-nano',
    name: 'OpenAI GPT-4.1 Nano',
    description: 'OpenAI GPT-4.1 Nano model',
    provider: 'openai',
    baseModelId: 'gpt-4.1-nano',
  },

  // Google Gemini
  {
    id: 'google-gemini-2.5-pro-preview-03-25',
    name: 'Google Gemini 2.5 Pro (Preview)',
    description: 'Google Gemini 2.5 Pro Preview model',
    provider: 'google',
    baseModelId: 'gemini-2.5-pro-preview-03-25',
  },
  {
    id: 'google-gemini-2.5-flash-preview-04-17',
    name: 'Google Gemini 2.5 Flash (Preview)',
    description: 'Google Gemini 2.5 Flash Preview model',
    provider: 'google',
    baseModelId: 'gemini-2.5-flash-preview-04-17',
  },
  {
    id: 'google-gemini-2.0-flash',
    name: 'Google Gemini 2.0 Flash',
    description: 'Google Gemini 2.0 Flash model',
    provider: 'google',
    baseModelId: 'gemini-2.0-flash',
  },
  {
    id: 'google-gemini-2.0-flash-lite',
    name: 'Google Gemini 2.0 Flash Lite',
    description: 'Google Gemini 2.0 Flash Lite model',
    provider: 'google',
    baseModelId: 'gemini-2.0-flash-lite',
  },
  {
    id: 'google-gemini-2.0-flash-exp-image-generation',
    name: 'Google Gemini 2.0 Flash (Image Gen)',
    description: 'Experimental image generation model',
    provider: 'google',
    baseModelId: 'gemini-2.0-flash-exp-image-generation',
  },
];

// Keep the second definition of availableModelIds AFTER chatModels
export const availableModelIds = chatModels.map((model) => model.id) as [
  string,
  ...string[],
];

// Keep the definition and export of the default model ID
export const DEFAULT_CHAT_MODEL_ID = 'google-gemini-2.5-pro-preview-03-25';

/**
 * Utility function to extract the provider and base model ID from a full model ID.
 * @param fullModelId The full model ID (e.g., "openai-gpt-4o")
 * @returns An object containing the provider and baseModelId, or null for provider if not found.
 */
export function getProviderAndBaseModel(fullModelId: string): {
  provider: ChatModel['provider'] | null;
  baseModelId: string;
} {
  const modelDetails = chatModels.find(model => model.id === fullModelId);
  if (modelDetails) {
    return { provider: modelDetails.provider, baseModelId: modelDetails.baseModelId };
  }
  // Fallback or error handling if ID not found in chatModels
  console.warn(`Model details not found for ID: ${fullModelId} in getProviderAndBaseModel`);
  // Return the full ID as baseModelId and null provider as a fallback
  return { provider: null, baseModelId: fullModelId };
}
