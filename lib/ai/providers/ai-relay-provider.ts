// Attempt to import necessary types. Adjust paths based on your @ai-sdk setup.
// These might be in '@ai-sdk/provider', '@ai-sdk/core', or re-exported from 'ai'.
import type { LanguageModel, LanguageModelV1 as LanguageModelProvider } from 'ai';
import { AiRelayLanguageModel } from './ai-relay-language-model';

/**
 * Configuration options for the AiRelayProvider.
 */
export interface AiRelayProviderOptions {
  /**
   * The base URL of the AI Relay Service.
   */
  url: string;
  /**
   * Optional headers to include in requests to the relay service.
   */
  headers?: Record<string, string>;
  // Add other config if needed (e.g., API keys for the relay itself)
}

/**
 * Provides language model instances that communicate via the AI Relay Service.
 */
export class AiRelayProvider {
  private options: AiRelayProviderOptions;
  readonly provider = 'ai-relay'; // Identify provider

  constructor(options: AiRelayProviderOptions) {
    if (!options.url) {
      throw new Error('AI Relay Service URL is required.');
    }
    // Ensure trailing slash for consistency?
    this.options = {
      ...options,
      url: options.url.endsWith('/') ? options.url : `${options.url}/`,
    };
  }

  /**
   * Returns a LanguageModel instance configured for a specific model ID
   * routed through the AI Relay Service.
   *
   * @param modelId The base model ID (e.g., 'gemini-1.5-flash', 'gpt-4o').
   * @param providerName The underlying provider ('google', 'openai') - needed by the relay service.
   * @returns An instance implementing the LanguageModel interface.
   */
  languageModel(modelId: string, providerName: string): LanguageModel {
    if (!providerName) {
      console.warn('[AiRelayProvider] Provider name not specified, relay service might require it.');
    }
    return new AiRelayLanguageModel(modelId, providerName, this.options);
  }

  // Implement other provider methods if needed (e.g., embeddingModel, transcriptionModel)
  // embeddingModel(modelId: string): EmbeddingModel { ... }
  // transcriptionModel(modelId: string): TranscriptionModel { ... }
}

/**
 * Factory function to create an AiRelayProvider instance.
 *
 * @param options Configuration options for the provider.
 * @returns A new AiRelayProvider instance.
 */
export function aiRelay(options: AiRelayProviderOptions): AiRelayProvider {
  return new AiRelayProvider(options);
} 