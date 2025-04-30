'use server';

// Remove generateText import if no longer used elsewhere in this file
// import { generateText, type UIMessage } from 'ai';
import type { UIMessage } from 'ai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
  saveMessages,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
// Remove myProvider import, no longer needed here
// import { myProvider } from '@/lib/ai/providers';
// Import the model details and the utility function
import { getProviderAndBaseModel } from '@/lib/ai/models';

const AI_RELAY_URL = process.env.AI_RELAY_SERVICE_URL;

// REMOVED: getProviderAndBaseModel function moved to models.ts

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function generateTitleFromUserMessage({
  message,
  selectedChatModel, // Full ID, e.g., "openai-gpt-4o"
}: {
  message: UIMessage;
  selectedChatModel: string;
}) {
  if (!AI_RELAY_URL) {
    console.error("AI_RELAY_SERVICE_URL environment variable is not set.");
    return "Chat";
  }

  // Get provider and base model ID from the full ID
  const { provider, baseModelId } = getProviderAndBaseModel(selectedChatModel);

  if (!provider) {
    console.error(`Could not determine provider for model ${selectedChatModel}`);
    return "Chat Title Error"; // Cannot proceed without provider
  }

  const titleEndpoint = `${AI_RELAY_URL}/api/v1/generate/title`;
  // Send provider and base_model_id to the relay service
  const payload = {
    provider: provider,
    base_model_id: baseModelId,
    prompt: typeof message.content === 'string' ? message.content : '', // Ensure prompt is a string
  };

  console.log(`Generating title via relay: ${titleEndpoint} for Provider: ${provider}, Model: ${baseModelId}`);

  try {
    const response = await fetch(titleEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      // Add timeout if desired using AbortSignal
      // signal: AbortSignal.timeout(15000) // e.g., 15 seconds
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Error generating title via relay: ${response.status} ${response.statusText}`, 
        { errorBody }
      );
      return "Chat Title Error"; // Fallback on relay error
    }

    const data = await response.json();
    const title = data?.title || "Chat";
    console.log(`Received title from relay: ${title}`);
    return title;
    
  } catch (error) {
    console.error("Network or other error calling title generation relay:", error);
    return "Chat Title Error"; // Fallback on network error
  }
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}

// Define a type for the message payload (subset of UIMessage relevant for saving)
// Align this with what you send from chat.tsx
interface SaveableUIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'function' | 'tool' | 'data';
  parts: Array<{ type: 'text'; text: string } | { type: 'tool_call'; toolCall: any } | { type: 'tool_result'; toolResult: any } | string >; // Match DB schema/UIMessage structure
  createdAt: Date;
  // Include attachments if your DB schema and chat.tsx call expect it
  // experimental_attachments?: Array<Attachment>;
}

// --- New Server Action to Save Assistant Message ---
export async function saveAssistantMessage({
  chatId,
  message,
}: {
  chatId: string;
  message: SaveableUIMessage; // Use the defined type
}) {
  console.log(`Saving assistant message ${message.id} for chat ${chatId}`);
  try {
    await saveMessages({
      messages: [
        {
          chatId: chatId,
          id: message.id,
          role: message.role,
          parts: message.parts, // Directly use parts if structure matches DB
          attachments: [], // Add attachments if needed: message.experimental_attachments ?? []
          createdAt: message.createdAt,
        },
      ],
    });
    console.log(`Successfully saved assistant message ${message.id}`);
  } catch (error) {
    console.error(`Error saving assistant message ${message.id} for chat ${chatId}:`, error);
    // Re-throw the error so the client-side catch block can handle it
    throw new Error('Failed to save assistant message to database.');
  }
}
// --- End New Server Action ---
