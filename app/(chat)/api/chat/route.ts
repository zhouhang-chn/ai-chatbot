import {
  appendClientMessage,
  type Message,
  type CreateMessage,
  type ToolCallPart,
  type ToolResultPart,
  type TextPart,
  streamText,
  createDataStreamResponse,
  type LanguageModelUsage,
  type FinishReason,
  type Tool,
  type UIMessage 
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { isProductionEnvironment } from '@/lib/constants';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
<<<<<<< HEAD
import { geolocation } from '@vercel/functions';
=======
import { chatModels, DEFAULT_CHAT_MODEL_ID } from '@/lib/ai/models';
import { NextRequest, NextResponse } from 'next/server';

// --- Custom Provider Import --- 
import { AiRelayProvider } from '@/lib/ai/providers/ai-relay-provider';

// --- Tool Implementation Imports --- 
import { getWeather } from '@/lib/ai/tools/get-weather'; 
import { createDocument } from '@/lib/ai/tools/create-document'; 
import { updateDocument } from '@/lib/ai/tools/update-document'; 
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions'; 

// --- Local Type Definition for Message Parts --- 
// Define MessagePart as a union of the specific part types we handle
type MessagePart = TextPart | ToolCallPart; 
>>>>>>> c0e93a3 (fixed debugging)

export const maxDuration = 60;

const AI_RELAY_URL = process.env.AI_RELAY_SERVICE_URL;

export async function POST(request: NextRequest) {
  let requestBody: PostRequestBody;
  console.log("--- New /api/chat POST request ---");

  if (!AI_RELAY_URL) {
    console.error("AI_RELAY_SERVICE_URL environment variable is not set.");
    return new Response('AI relay service is not configured.', { status: 500 });
  }

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
    console.log("Received /api/chat request body messages:", JSON.stringify(requestBody.message, null, 2));
    console.log("Received /api/chat full request body:", JSON.stringify(requestBody, null, 2));
  } catch (error) {
    console.error("Error parsing request body in /api/chat:", error);
    return new Response('Invalid request body', { status: 400 });
  }

  try {
    const { id: chatId, message, selectedChatModel } = requestBody;

    const session = await auth();
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }
    const userId = session.user.id;
    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: userId,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new Response('Message limit exceeded.', { status: 429 });
    }

    const chat = await getChatById({ id: chatId });

    // Determine the model ID to use
    let modelIdToUse: string;
    if (!chat) {
      // New chat: Use model from request and save it
      modelIdToUse = selectedChatModel;
      const title = await generateTitleFromUserMessage({ message, selectedChatModel: modelIdToUse });
      await saveChat({ id: chatId, userId: userId, title, selectedChatModel: modelIdToUse });
    } else {
      // Existing chat: Use the model stored in the chat record
      if (chat.userId !== userId) {
        return new Response('Forbidden', { status: 403 });
      }
      // Use the chat's model if it exists, otherwise use the imported default
      modelIdToUse = chat.selectedChatModel ?? DEFAULT_CHAT_MODEL_ID; 
    }

    const previousMessages = await getMessagesByChatId({ id: chatId });
    // --- ADDED LOG: Raw DB Messages ---
    console.log("[API Route] Previous messages from DB:", JSON.stringify(previousMessages, null, 2));

    // --- REVISED Message Mapping v3 (Focus on UIMessage parts) --- 
    const mappedPreviousMessages: UIMessage[] = previousMessages.map(dbMsg => {
      const partsFromDb = (dbMsg.parts ?? []) as Array<any>; // Cast to any for easier processing
      const mappedParts: UIMessage['parts'] = [];
      const toolCallsForSdk: ToolCallPart[] = [];
      const toolResultsForSdk: ToolResultPart[] = [];

      let combinedTextContent = ''; // Still needed for top-level content?

      for (const part of partsFromDb) {
        if (!part || !part.type) continue; // Skip invalid parts

        switch (part.type) {
          case 'text':
            mappedParts.push({ type: 'text', text: part.text });
            combinedTextContent += (combinedTextContent ? '\n' : '') + part.text;
            break;
          case 'tool-invocation':
            // Add the structured invocation part for the UI
            mappedParts.push({ type: 'tool-invocation', toolInvocation: part.toolInvocation });

            // Extract structured info for SDK top-level properties (tool_calls, tool_results)
            const invo = part.toolInvocation;
            if (invo && invo.toolCallId && invo.toolName && invo.args) {
              // Add to toolCallsForSdk regardless of state (SDK might need call info)
              toolCallsForSdk.push({
                type: 'tool-call',
                toolCallId: invo.toolCallId,
                toolName: invo.toolName,
                args: invo.args,
              });
              // Add to toolResultsForSdk ONLY if state is result
              if (invo.state === 'result' && invo.result !== undefined) {
                toolResultsForSdk.push({
                  type: 'tool-result',
                  toolCallId: invo.toolCallId,
                  toolName: invo.toolName,
                  result: invo.result,
                });
              }
            }
            break;
          // Handle other part types explicitly if they exist in DB and are needed
          case 'step-start': // Example: pass through step markers if present
             mappedParts.push({ type: 'step-start'});
             break;
          // Add cases for 'reasoning', 'source', 'file', etc. if they can be stored in dbMsg.parts
          default:
            // Optionally log unhandled part types
            // console.warn(`[API Route] Unhandled part type in DB message: ${part.type}`);
            break;
        }
      }

      const mappedMsg: UIMessage = {
        id: dbMsg.id,
        role: dbMsg.role as UIMessage['role'],
        content: combinedTextContent, // Now only contains actual text content
        createdAt: dbMsg.createdAt,
        parts: mappedParts, // The correctly structured parts array for UI
        // Add SDK-specific top-level properties derived from parts
        ...(toolCallsForSdk.length > 0 && { tool_calls: toolCallsForSdk }), 
        ...(toolResultsForSdk.length > 0 && { tool_results: toolResultsForSdk }),
      };
      return mappedMsg;
    });
    // --- END REVISED Message Mapping v3 ---
    // --- ADDED LOG: Mapped Messages for SDK ---
    console.log("[API Route] Mapped previous messages for SDK:", JSON.stringify(mappedPreviousMessages, null, 2));

    const messages = appendClientMessage({
      messages: mappedPreviousMessages,
      message,
    });

<<<<<<< HEAD
    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: message.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages,
=======
    await saveMessages({ messages: [
      {
        chatId: chatId,
        id: message.id,
        role: 'user',
        parts: message.parts,
        attachments: message.experimental_attachments ?? [],
        createdAt: new Date(),
      },
    ] });

    // Use the determined modelIdToUse
    const modelDetails = chatModels.find(model => model.id === modelIdToUse);

    if (!modelDetails) {
        console.error(`Model details not found for validated ID: ${modelIdToUse}`);
        return new Response(`Internal server error: Model details not found for ${modelIdToUse}`, { status: 500 });
    }

    const provider = modelDetails.provider;
    const baseModelId = modelDetails.baseModelId;

    const relayProvider = new AiRelayProvider({ url: AI_RELAY_URL });

    return createDataStreamResponse({ 
      async execute(dataStream) {
        const tools: Record<string, Tool<any, any>> = {
          getWeather: getWeather as Tool<any, any>,
          // Pass chatId along with other props
          createDocument: createDocument({ session, dataStream, relayProvider, provider, baseModelId, chatId }) as Tool<any, any>,
          updateDocument: updateDocument({ session, dataStream, relayProvider, provider, baseModelId, chatId }) as Tool<any, any>,
          requestSuggestions: requestSuggestions({ session, dataStream }) as Tool<any, any>,
        };

        const activeTools = [
             'getWeather', 
             'createDocument', 
             'updateDocument', 
             'requestSuggestions'
        ];

        // --- Processing logic REMOVED - Moved to AiRelayLanguageModel --- 

        const result = await streamText({
          // Use the determined modelIdToUse here
          model: relayProvider.languageModel(baseModelId, provider),
          // --- Pass original messages - Provider will handle processing --- 
          messages: (() => {
            console.log("[API Route] Original 'messages' array passed to streamText (provider handles processing):", JSON.stringify(messages, null, 2));
            return messages as Message[];
          })(),
          system: systemPrompt({ selectedChatModel: modelIdToUse }), 
          tools: tools,
          experimental_activeTools: activeTools,
>>>>>>> c0e93a3 (fixed debugging)
          maxSteps: 5,
          experimental_generateMessageId: generateUUID,
          onFinish: async ({ 
              text, 
              toolCalls, 
              toolResults, 
              finishReason, 
              usage, 
              response 
          }: {
              text: string;
              toolCalls?: ToolCallPart[];
              toolResults?: ToolResultPart[];
              finishReason: FinishReason;
              usage: LanguageModelUsage;
              response: { messages: any[] };
          }) => {
            // --- REMOVED Assistant Message Saving Logic --- 
            // The frontend (useChat hook) is now responsible 
            // for saving the complete assistant message with tool parts.
            console.log("[streamText] onFinish callback executed (backend saving removed).", { finishReason, usage, textLength: text?.length, toolCallsCount: toolCalls?.length });
            // --- END REMOVAL --- 
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text-via-relay',
          },
        });

        result.mergeIntoDataStream(dataStream);
        
        // Let the stream consumer handle closing/finishing
        // It's important not to block here if mergeIntoDataStream handles piping
        // await result.consumeStream(); 
        // Instead, rely on the framework handling the stream response closure.
      },
      onError: (error) => {
        console.error("[createDataStreamResponse] Error:", error);
        return "An error occurred while processing the request.";
      },
    });
  } catch (error) {
    console.error("Error processing /api/chat request:", error);
    return NextResponse.json({ error: "An error occurred while processing your request!" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    const deletedChat = await deleteChatById({ id });

    return Response.json(deletedChat, { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
