import type { UserType } from '@/app/(auth)/auth';
import { availableModelIds, type AvailableChatModelId } from './models';

interface Entitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<AvailableChatModelId>;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account
   */
  guest: {
    maxMessagesPerDay: 200,
    availableChatModelIds: [...availableModelIds],
  },

  /*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay: 10000,
    availableChatModelIds: [...availableModelIds],
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
