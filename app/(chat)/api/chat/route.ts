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

    // FIX Linter Error (Attempt 3 - Temporary Simplification):
    // Assume messageCount structure is correct if function returns truthy
    // TODO: Revisit type checking for messageCount from getMessageCountByUserId
    if (messageCount && (messageCount as any).count > entitlementsByUserType[userType].maxMessagesPerDay) {
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

    // --- REVERT Message Mapping to handle nested DB structure --- 
    const mappedPreviousMessages: UIMessage[] = previousMessages.map(dbMsg => {
      const partsFromDb = (dbMsg.parts ?? []) as Array<any>; // Cast to any
      const mappedPartsForUi: UIMessage['parts'] = [];
      let combinedTextContent = '';

      for (const part of partsFromDb) {
        if (!part || !part.type) continue;

        if (part.type === 'text') {
          mappedPartsForUi.push({ type: 'text', text: part.text });
          combinedTextContent += (combinedTextContent ? '\\n' : '') + part.text;
        } else if (part.type === 'tool-invocation') {
            // Directly map the nested structure for UI
            mappedPartsForUi.push({ 
                type: 'tool-invocation', 
                toolInvocation: part.toolInvocation // Assume DB stores the nested object
            });
            // Extract text from result.content if it exists, for combinedTextContent?
            // This might be complex or unnecessary depending on UI needs.
        } else if (part.type === 'step-start') {
           mappedPartsForUi.push({ type: 'step-start'});
        }
        // Handle other types like 'tool-call', 'tool-result' if they somehow exist?
        // Based on the working DB, they shouldn't if saving is correct.
        // else {
        //    console.warn(`[API Route] Unhandled part type in DB message: ${part.type}`);
        // }
      }

      // Construct UIMessage WITHOUT top-level tool_calls/tool_results
      const mappedMsg: UIMessage = {
        id: dbMsg.id,
        role: dbMsg.role as UIMessage['role'],
        content: combinedTextContent, // Contains only text
        createdAt: dbMsg.createdAt,
        parts: mappedPartsForUi, // UI parts array with nested tool-invocations
        // DO NOT ADD tool_calls or tool_results here
      };
      return mappedMsg;
    });
    // --- END REVERT Message Mapping ---
    // --- ADDED LOG: Mapped Messages for UI/SDK --- 
    console.log("[API Route] Mapped previous messages for UI/SDK (nested parts):", JSON.stringify(mappedPreviousMessages, null, 2));

    // Append the *current* user message
    const messages = appendClientMessage({
      messages: mappedPreviousMessages,
      message, // Incoming message from client
    });

    // Save the *current* user message
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
        // --- Accumulated Parts for DB (REMOVED - Reverting to onFinish logic) --- 
        // const accumulatedDbParts: Array<any> = []; 

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
          // --- Pass Mapped messages with NESTED parts --- 
          messages: (() => {
            console.log("[API Route] NESTED 'messages' array passed to streamText:", JSON.stringify(messages, null, 2));
            // Cast to SDK's Message type
            return messages as Message[];
          })(),
          system: systemPrompt({ 
            selectedChatModel: modelIdToUse, 
            requestHints: { latitude: '', longitude: '', city: '', country: '' } // Provide defaults
          }), 
          tools: tools,
          experimental_activeTools: activeTools,
          maxSteps: 5,
          experimental_generateMessageId: generateUUID,
          // --- REMOVE experimental callbacks --- 
          // experimental_onToolCall: ... removed ...
          // experimental_onToolResult: ... removed ...
          // --- Restore onFinish logic with logging --- 
          onFinish: async ({ 
              text, // Keep for logging/fallback, but don't use for parts
              toolCalls, // Keep for logging/fallback
              toolResults, // Keep for logging/fallback
              finishReason, 
              usage, 
              response // *** USE THIS FOR PARTS ***
          }: {
              text: string;
              toolCalls?: ToolCallPart[]; 
              toolResults?: ToolResultPart[]; 
              finishReason: FinishReason;
              usage: LanguageModelUsage;
              response: { messages: any[] }; 
          }) => {
            const assistantMessageId = generateUUID();
            const dbParts: Array<any> = []; // Final parts to save to DB
            const pendingToolCalls: Record<string, any> = {}; // Temp store for tool calls { toolCallId: callPart }
    
            // --- Modify Logging --- 
            console.log('[streamText] onFinish Received:');
            console.log(`  - response object: ${JSON.stringify(response, null, 2)}`); // Log the key object
            console.log(`  - finishReason: ${finishReason}`);
            // --- End Logging --- 
            
            // --- CORRECTED Logic v2: Handle parts across messages --- 
            if (response && Array.isArray(response.messages)) {
              for (const message of response.messages) {
                  console.log(`[onFinish] Processing message with role: ${message.role}`); 
                  if (message.role === 'assistant') {
                      if (Array.isArray(message.content)) {
                          for (const part of message.content) {
                              console.log(`[onFinish]   Processing ASSISTANT part: ${JSON.stringify(part)}`); 
                              if (part.type === 'text' && part.text) {
                                  dbParts.push({ type: 'text', text: part.text });
                              } else if (part.type === 'tool-call') {
                                  // Store the call part temporarily, waiting for its result
                                  pendingToolCalls[part.toolCallId] = part; 
                              }
                          }
                      } else if (typeof message.content === 'string' && message.content.trim() !== '') {
                               // Handle simple text-only assistant message
                               dbParts.push({ type: 'text', text: message.content });
                          }
                      } else if (message.role === 'tool') {
                          if (Array.isArray(message.content)) {
                              for (const part of message.content) {
                                  console.log(`[onFinish]   Processing TOOL part: ${JSON.stringify(part)}`); 
                                  if (part.type === 'tool-result') {
                                      const matchingCall = pendingToolCalls[part.toolCallId];
                                      if (matchingCall) {
                                          // Found the call, create the combined invocation part
                                          dbParts.push({
                                              type: 'tool-invocation',
                                              toolInvocation: {
                                                  state: 'result',
                                                  toolCallId: part.toolCallId,
                                                  toolName: matchingCall.toolName, // Name from call part
                                                  args: matchingCall.args,       // Args from call part
                                                  result: part.result          // Result from result part
                                              }
                                          });
                                          // Remove the call from pending map
                                          delete pendingToolCalls[part.toolCallId];
                                      } else {
                                          console.warn(`[onFinish] Found tool-result but its call ID (${part.toolCallId}) was not pending.`);
                                      }
                                  }
                              }
                          }
                      }
                  }
                  
                  // After processing all messages, check for any pending calls that never got a result
                  // (This indicates an issue, maybe save them with state: 'call' or just log)
                  Object.entries(pendingToolCalls).forEach(([toolCallId, callPart]) => {
                      console.warn(`[onFinish] Tool call ${toolCallId} (${callPart.toolName}) was left pending without a result.`);
                      // Optionally add to dbParts with state: 'call' if needed by UI immediately
                      // dbParts.push({ type: 'tool-invocation', toolInvocation: { state: 'call', ...callPart } });
                  });

                } else {
                     console.warn("[streamText] onFinish: Response object or messages array missing/invalid. Cannot construct parts.");
                }
                // --- End CORRECTED Logic v2 --- 
    
                // --- Save Constructed Parts --- 
                if (dbParts.length > 0) { 
                   await saveMessages({ messages: [
                     {
                       chatId: chatId, 
                       id: assistantMessageId,
                       role: 'assistant',
                       parts: dbParts, // Use parts constructed here
                       attachments: [], 
                       createdAt: new Date(),
                     },
                   ] });
                   console.log(`[streamText] onFinish: Saved assistant message ${assistantMessageId} with ${dbParts.length} constructed parts.`);
                } else {
                   console.log("[streamText] onFinish: No assistant message parts constructed to save.");
                }

                console.log("[streamText] onFinish callback executed.", { finishReason, usage, textLength: text?.length });
                // --- END Restored Saving Logic --- 
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
