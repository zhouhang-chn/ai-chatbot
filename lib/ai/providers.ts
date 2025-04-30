import {
  customProvider,
  extractReasoningMiddleware,
  LanguageModelV1,
  ImageModel,
  Provider,
  wrapLanguageModel,
} from 'ai';
import { xai } from '@ai-sdk/xai';
import { openai, OpenAIProvider } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

// Define models for the non-test environment dynamically
const productionLanguageModels: Record<string, LanguageModelV1> = {};
const productionImageModels: Record<string, ImageModel> = {};

// xAI Grok
if (process.env.XAI_API_KEY) {
  productionLanguageModels['grok-2-vision'] = xai('grok-2-vision-1212');
  productionLanguageModels['grok-3-mini-reasoning'] = wrapLanguageModel({
    model: xai('grok-3-mini-beta'),
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  });
  productionLanguageModels['grok-2-title'] = xai('grok-2-1212');
  productionLanguageModels['grok-2-artifact'] = xai('grok-2-1212');
  productionImageModels['grok-image'] = xai.image('grok-2-image');
} else {
  console.warn(
    'XAI_API_KEY not found. xAI models and image models will not be available.',
  );
}

// OpenAI
if (process.env.OPENAI_API_KEY) {
  productionLanguageModels['openai-gpt-4o'] = openai('gpt-4o');
  productionLanguageModels['openai-gpt-4o-reasoning'] = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  });
  productionLanguageModels['openai-gpt-4-turbo-title'] = openai('gpt-4-turbo');
  // Add OpenAI image models if needed, e.g., productionImageModels['dall-e-3'] = openai.image('dall-e-3');
} else {
  console.warn(
    'OPENAI_API_KEY not found. OpenAI models will not be available.',
  );
}

// Google Gemini
if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  productionLanguageModels['google-gemini-1.5-pro'] = google(
    'models/gemini-1.5-pro-latest',
  );
  productionLanguageModels['google-gemini-1.5-pro-reasoning'] =
    wrapLanguageModel({
      model: google('models/gemini-1.5-pro-latest'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    });
  productionLanguageModels['google-gemini-1.5-flash-title'] = google(
    'models/gemini-1.5-flash-latest',
  );
  // Add Google image models if needed
} else {
  console.warn(
    'GOOGLE_GENERATIVE_AI_API_KEY not found. Google Gemini models will not be available.',
  );
}

// DeepSeek (via OpenAI-compatible API)
/* // Commenting out DeepSeek block due to initialization issues
if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_BASE) {
  try {
    // Explicitly type the provider instance
    const deepseekProvider: OpenAIProvider = openai.provider({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_API_BASE,
      // Add other necessary headers/compatibility flags here if needed
    });

    // Use the configured provider instance to get models
    productionLanguageModels['deepseek-chat'] = deepseekProvider('deepseek-chat');
    productionLanguageModels['deepseek-chat-reasoning'] = wrapLanguageModel({
      model: deepseekProvider('deepseek-chat'), // Use the same provider instance
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    });
  } catch (error) {
    console.error("Failed to initialize DeepSeek provider:", error);
    console.warn("DeepSeek models will not be available due to initialization error.");
  }
} else {
  console.warn(
    'DEEPSEEK_API_KEY or DEEPSEEK_API_BASE not found. DeepSeek models will not be available.',
  );
}
*/

// Check if any models were loaded
if (Object.keys(productionLanguageModels).length === 0) {
  // In a real app, you might want a more graceful fallback or error handling
  // For now, we throw an error to make the missing configuration obvious during development
  console.error(
    'No AI provider API keys found in environment variables. Cannot initialize AI provider.',
  );
  // Optionally throw to prevent startup without any models:
  // throw new Error('No AI provider API keys configured.');
}

export const myProvider: Provider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: productionLanguageModels,
      imageModels: productionImageModels,
    });
