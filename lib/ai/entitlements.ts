import type { UserType } from '@/app/(auth)/auth';
import type { ChatModel } from './models';

interface Entitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account
   */
  guest: {
    maxMessagesPerDay: 20,
    // TODO: Decide which models guests should access.
    // Using Grok Mini reasoning as an example if XAI_API_KEY is set.
    availableChatModelIds: [
      'openai-gpt-4o',
      'openai-gpt-4o-reasoning'
    ]
  },

  /*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay: 100,
    // Allow regular users access to all configured models
    availableChatModelIds: [
      'grok-2-vision',
      'grok-3-mini-reasoning',
      'openai-gpt-4o',
      'openai-gpt-4o-reasoning',
      'google-gemini-1.5-pro',
      'google-gemini-1.5-pro-reasoning',
    ],
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
