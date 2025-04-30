'use server';

import { generateText, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
import { myProvider } from '@/lib/ai/providers';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function generateTitleFromUserMessage({
  message,
  selectedChatModel,
}: {
  message: UIMessage;
  selectedChatModel: string;
}) {
  // Determine which title generation model ID to use based on the selected chat model's provider
  let titleModelId: string | null = null;

  if (selectedChatModel.startsWith('grok-') && process.env.XAI_API_KEY) {
    titleModelId = 'grok-2-title';
  } else if (selectedChatModel.startsWith('openai-') && process.env.OPENAI_API_KEY) {
    titleModelId = 'openai-gpt-4-turbo-title';
  } else if (selectedChatModel.startsWith('google-') && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    titleModelId = 'google-gemini-1.5-flash-title';
  } else {
    // Fallback logic if the selected model doesn't match or provider key is missing
    // Try to find *any* available title model based on env keys as a last resort
    if (process.env.XAI_API_KEY) titleModelId = 'grok-2-title';
    else if (process.env.OPENAI_API_KEY) titleModelId = 'openai-gpt-4-turbo-title';
    else if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) titleModelId = 'google-gemini-1.5-flash-title';
  }

  if (!titleModelId) {
    console.error(
      'No suitable model found for title generation. Ensure selected model provider API key is set and a corresponding title model exists.',
    );
    return 'New Chat';
  }

  try {
    // Use the selected model ID
    const { text: title } = await generateText({
      // This will throw if the specific model ID wasn't actually added
      // in providers.ts for the available provider, which is good error checking.
      model: myProvider.languageModel(titleModelId),
      system: `\n      - you will generate a short title based on the first message a user begins a conversation with
      - ensure it is not more than 80 characters long
      - the title should be a summary of the user's message
      - do not use quotes or colons`,
      prompt: JSON.stringify(message.content), // Send only the text content for title generation
    });
    return title;
  } catch (error) {
    console.error("Error generating title:", error);
    return "New Chat";
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
