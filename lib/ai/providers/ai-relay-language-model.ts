// Import ALL V1 types from @ai-sdk/provider
import type {
  LanguageModelV1 as LanguageModel, 
  LanguageModelV1CallOptions as LanguageModelCallOptions,
  LanguageModelV1StreamPart as StreamPart, 
  LanguageModelV1FinishReason as FinishReason, 
  LanguageModelV1FunctionToolCall as ToolCall, 
  LanguageModelV1Message as V1Message, 
  LanguageModelV1FunctionTool as V1FunctionTool, 
} from '@ai-sdk/provider'; 

// Import LanguageModelUsage separately if not from provider
import type { LanguageModelUsage } from 'ai';

import type { AiRelayProviderOptions } from './ai-relay-provider';

/**
 * Implements the LanguageModel interface (V1) by routing requests
 * through the AI Relay Service.
 */
export class AiRelayLanguageModel implements LanguageModel {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'tool';

  readonly modelId: string;
  readonly providerName: string;
  private options: AiRelayProviderOptions;
  readonly provider = 'ai-relay';
  readonly defaultHeaders: Record<string, string> | undefined;

  constructor(modelId: string, providerName: string, options: AiRelayProviderOptions) {
    this.modelId = modelId;
    this.providerName = providerName;
    this.options = options;
    this.defaultHeaders = options.headers;
  }

  // --- Core Method: doStream ---
  async doStream(
    options: LanguageModelCallOptions
  ): Promise<{
    stream: ReadableStream<StreamPart>;
    rawResponse?: { headers?: Record<string, string> };
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
  }> {
    const { prompt, ...rawSettings } = options;
    const rawCall = { rawPrompt: prompt, rawSettings };

    const relayPayload = this.prepareRelayPayload(options);
    const relayUrl = `${this.options.url}api/v1/generate/stream`;
    let relayResponse;

    try {
      relayResponse = await fetch(relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.defaultHeaders,
          ...options.headers,
        },
        body: JSON.stringify(relayPayload),
        signal: options.abortSignal,
      });
    } catch (error) {
      console.error(`[AiRelayLanguageModel] Network error calling ${relayUrl}:`, error);
      throw new Error(`Network error calling AI Relay Service: ${error instanceof Error ? error.message : String(error)}`);
    }

    const responseHeaders = relayResponse.headers ? headersToRecord(relayResponse.headers) : undefined;

    if (!relayResponse.ok || !relayResponse.body) {
      const errorBody = await relayResponse.text().catch(() => 'Failed to read error body');
      console.error(`[AiRelayLanguageModel] AI Relay service error: ${relayResponse.status} ${relayResponse.statusText}`, { relayUrl, errorBody });
      const errorStream = new ReadableStream<StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'error', error: new Error(`AI Relay service error: ${relayResponse.status} ${relayResponse.statusText} - ${errorBody}`) });
          controller.close();
        }
      });
      return { stream: errorStream, rawResponse: { headers: responseHeaders }, rawCall };
    }

    const sdkStream = this.translateRelayStream(relayResponse.body);

    return {
      stream: sdkStream,
      rawResponse: { headers: responseHeaders },
      rawCall,
    };
  }

  // --- Implement doGenerate ---
  async doGenerate(
      options: LanguageModelCallOptions
  ): Promise<Awaited<ReturnType<LanguageModel['doGenerate']>>> { 
      const { prompt, ...rawSettings } = options;
      const rawCall = { rawPrompt: prompt, rawSettings };

      const { stream, rawResponse } = await this.doStream(options);
      const reader = stream.getReader();

      let text = '';
      // Use V1 ToolCall type
      let toolCalls: ToolCall[] = []; 
      // Use V1 FinishReason type
      let finishReason: FinishReason = 'other'; 
      // Assuming LanguageModelUsage is still from 'ai'
      let usage: LanguageModelUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }; 
      let finalUsage: LanguageModelUsage | undefined = undefined;

      while (true) {
          const { done, value } = await reader.read(); // value is StreamPart (LanguageModelV1StreamPart)
          if (done) break;

          switch (value.type) {
              case 'text-delta':
                  text += value.textDelta;
                  break;
              case 'tool-call':
                  // Ensure structure matches V1 ToolCall
                  toolCalls.push({
                     toolCallId: value.toolCallId,
                     toolCallType: 'function', // Add required type
                     toolName: value.toolName,
                     args: value.args,
                  });
                  break;
              case 'finish':
                  // Assign V1 finishReason directly
                  finishReason = value.finishReason; 
                  finalUsage = {
                    promptTokens: value.usage.promptTokens,
                    completionTokens: value.usage.completionTokens,
                    totalTokens: value.usage.promptTokens + value.usage.completionTokens,
                  };
                  break;
              case 'error':
                 throw value.error;
          }
      }

      // Return object conforming to Awaited<ReturnType<LanguageModel['doGenerate']>>
      console.log('[AiRelayLanguageModel] doGenerate result:', {
        text: text || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason
      });
      return {
        text: text || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason,
        usage: finalUsage ?? usage,
        rawCall, 
      };
  }

  // --- Helper: Prepare Payload for Relay Service ---
  private prepareRelayPayload(options: LanguageModelCallOptions): any {

    // --- Standard OpenAI API Message Formatting v2 --- 
    const processedMessagesForApi: Array<any> = [];
    // Process prompt from options, assuming V1Message format from SDK
    for (const msg of options.prompt as V1Message[]) {
      switch (msg.role) {
        case 'system':
          processedMessagesForApi.push({ role: 'system', content: msg.content });
          break;

        case 'user':
          // Simplify content if it's a single text part array, else keep original
          let userContent: string | Array<any>;
          if (Array.isArray(msg.content) && msg.content.length === 1 && msg.content[0].type === 'text') {
             userContent = msg.content[0].text;
          } else {
             userContent = msg.content;
          }
          processedMessagesForApi.push({ role: 'user', content: userContent });
          break;

        case 'assistant':
          let assistantTextContent = '';
          const toolCallsForApi: any[] = [];

          // Extract text and tool calls ONLY from content parts if it's an array
          if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === 'text') {
                 assistantTextContent += (assistantTextContent ? '\n' : '') + part.text;
              } else if (part.type === 'tool-call') {
                 toolCallsForApi.push({
                   id: part.toolCallId,
                   type: 'function',
                   function: {
                     name: part.toolName,
                     arguments: JSON.stringify(part.args), // Args should be stringified JSON
                   },
                 });
              }
              // Ignore other part types like tool-result here
            }
          } else if (typeof msg.content === 'string') {
             // Handle case where content is just a string (no tool calls expected here in V1)
             assistantTextContent = msg.content;
          }
          
          processedMessagesForApi.push({
            role: 'assistant',
            content: assistantTextContent || " ", // Use space if no text
            tool_calls: toolCallsForApi.length > 0 ? toolCallsForApi : undefined,
          });
          break;

        case 'tool':
           // Primarily expect result data within content parts array in V1
           let toolResultContent = '[]'; // Default to empty JSON array string
           let toolCallId = '';
           let toolName = ''; 

           if (Array.isArray(msg.content)) {
               // Find the first tool-result part
               const resultPart = msg.content.find(part => part.type === 'tool-result');
               if (resultPart && resultPart.type === 'tool-result') { // Check type again for TS narrowing
                   toolResultContent = JSON.stringify(resultPart.result ?? '');
                   toolCallId = resultPart.toolCallId;
                   toolName = resultPart.toolName;
               } else {
                  console.warn("[AiRelayLanguageModel] Tool message content is array but no 'tool-result' part found.");
               }
           } else if (typeof msg.content === 'string') {
                // If content is string, assume it IS the stringified result
                // Need tool_call_id and name from elsewhere (less standard)
                toolResultContent = msg.content;
                toolCallId = (msg as any).tool_call_id || (msg as any).toolCallId || ''; 
                toolName = (msg as any).tool_name || (msg as any).name || ''; 
                if (!toolCallId) {
                   console.error("[AiRelayLanguageModel] Tool message content is string, but cannot find toolCallId!");
                }
           } else {
                console.error("[AiRelayLanguageModel] Unexpected content type for tool message:", typeof msg.content);
           }
           
           if (toolCallId) { // Only add if we have an ID
                processedMessagesForApi.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    name: toolName, // Name might be empty if derived from string content
                    content: toolResultContent
                });
           } else {
               console.error("[AiRelayLanguageModel] Could not determine toolCallId for tool message:", JSON.stringify(msg));
           }
          break;

        default:
          console.warn("[AiRelayLanguageModel] Filtering out unexpected message role:", msg.role);
          break;
      }
    }
    // --- End Standard OpenAI API Message Formatting v2 ---

    // Extract system prompt separately 
    const system_prompt_msg = processedMessagesForApi.find((m: any) => m.role === 'system');
    const system_prompt = system_prompt_msg?.content as string | undefined;
    // Filter out system prompt from processed messages if handled separately by API
    const messagesForPayload = processedMessagesForApi.filter((m: any) => m.role !== 'system');

    let relayTools: any[] | undefined = undefined;
    let tool_choice: any | undefined = undefined;

    if (options.mode?.type === 'regular') {
       // ... tool_choice logic ...
       if (options.mode.toolChoice?.type === 'required') {
           tool_choice = 'required';
        } else if (options.mode.toolChoice?.type === 'tool') {
          tool_choice = { type: 'function', function: { name: options.mode.toolChoice.toolName } };
        } else {
           tool_choice = options.mode.toolChoice?.type;
        }

        // Use explicit V1FunctionTool type
        // Map tool properties directly to nested function object for relay
        relayTools = options.mode.tools?.map((toolDef) => { // toolDef is LanguageModelV1FunctionTool | LanguageModelV1ProviderDefinedTool
              if (toolDef.type === 'function') {
                  // Construct the nested function object
                  return {
                      type: 'function',
                      function: { 
                        name: toolDef.name, // Access directly
                        description: toolDef.description, // Access directly
                        parameters: toolDef.parameters // Access directly
                      }
                  };
              }
              console.warn("[AiRelayLanguageModel] Unsupported tool type in options:", toolDef.type);
              return null;
            }).filter(Boolean); 
    } else if (options.mode?.type === 'object-tool') {
        // Use explicit V1FunctionTool type
        const tool: V1FunctionTool = options.mode.tool;
        if (tool.type === 'function') {
            // Construct the nested function object for tool_choice and relayTools
            tool_choice = { type: 'function', function: { name: tool.name } }; 
            relayTools = [{
                type: 'function',
                function: { 
                  name: tool.name, // Access directly
                  description: tool.description, // Access directly
                  parameters: tool.parameters // Access directly
                }
            }];
        } else {
             console.warn("[AiRelayLanguageModel] Unsupported tool type in object-tool mode:", tool.type);
        }
    }

    // Construct the final payload
    const payload = {
        provider: this.providerName,
        base_model_id: this.modelId,
        // --- Use Processed Messages for API --- 
        messages: messagesForPayload, 
        tools: relayTools,
        tool_choice: tool_choice,
        // Include system prompt if it exists and messagesForPayload doesn't contain it
        ...(system_prompt && !messagesForPayload.some((m: any) => m.role === 'system') && { system_prompt: system_prompt }),
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        top_p: options.topP,
        top_k: options.topK,
        presence_penalty: options.presencePenalty,
        frequency_penalty: options.frequencyPenalty,
        stop_sequences: options.stopSequences,
        seed: options.seed,
    };
    // Remove undefined keys
    Object.keys(payload).forEach(key => (payload as any)[key] === undefined && delete (payload as any)[key]);

    console.log('[AiRelayLanguageModel] Sending FLATTENED payload to relay:', JSON.stringify(payload, null, 2));

    return payload;
  }

  // --- Helper: Translate Relay Stream Chunks to SDK Internal Chunks ---
  private translateRelayStream(relayStream: ReadableStream<Uint8Array>): ReadableStream<StreamPart> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';

    return new ReadableStream<StreamPart>({
      async start(controller) {
        const reader = relayStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read(); 
            if (done) {
              if (buffer.trim()) processLine(buffer, controller);
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.trim() !== '') processLine(line, controller);
            }
          }
        } catch (error) {
          console.error('[AiRelayLanguageModel] Error reading/translating relay stream:', error);
          controller.enqueue({ type: 'error', error: error instanceof Error ? error : new Error(String(error)) });
          controller.error(error);
        } finally {
          controller.close();
        }
      },
      cancel(reason) {
        console.log('[AiRelayLanguageModel] SDK stream cancelled:', reason);
      }
    });

    function processLine(line: string, controller: ReadableStreamDefaultController<StreamPart>) {
       const separatorIndex = line.indexOf(':');
       if (separatorIndex === -1) {
         console.warn('[AiRelayLanguageModel] Invalid line format (no prefix):', line);
         return;
       }
       const prefix = line.substring(0, separatorIndex);
       const jsonText = line.substring(separatorIndex + 1).trim();

       if (!jsonText) return;

       // --- Tool call buffering state ---
       // These are static so they persist across calls to processLine within the stream
       if (!(processLine as any)._toolCallBuffer) {
         (processLine as any)._toolCallBuffer = null;
         (processLine as any)._toolCallMeta = null;
       }
       const _toolCallBuffer = (processLine as any)._toolCallBuffer;
       const _toolCallMeta = (processLine as any)._toolCallMeta;

       try {
         const jsonData = JSON.parse(jsonText);
         switch (prefix) {
           case '0': // text-delta
             if (typeof jsonData === 'string') {
               controller.enqueue({ type: 'text-delta', textDelta: jsonData });
             } else {
                console.warn('[AiRelayLanguageModel] Invalid text-delta:', jsonData);
             }
             break;
           case '1': // tool-call
             // Multi-chunk tool call buffering logic
             if (jsonData.function_call?.name && typeof jsonData.function_call.arguments === 'string') {
               // If this is the start of a new tool call, or a single-chunk tool call
               if (jsonData.function_call.arguments.startsWith('{') && jsonData.function_call.arguments.endsWith('}')) {
                 // Single-chunk tool call (or already complete)
                 let parsedArgs;
                 try {
                   parsedArgs = JSON.parse(jsonData.function_call.arguments);
                 } catch (e) {
                   console.error('[AiRelayLanguageModel] Failed to parse tool-call arguments:', jsonData.function_call.arguments, e);
                   parsedArgs = {};
                 }
                 // Log before enqueueing
                 console.log('[AiRelayLanguageModel] Enqueuing tool-call.', "Name:", jsonData.function_call.name, "Type of args:", typeof jsonData.function_call.arguments, "Value:", jsonData.function_call.arguments);
                 controller.enqueue({
                   type: 'tool-call',
                   toolCallType: 'function',
                   toolCallId: jsonData.id || `tool_${Date.now()}`,
                   toolName: jsonData.function_call.name,
                   args: jsonData.function_call.arguments
                 });
                 // Reset buffer if any
                 (processLine as any)._toolCallBuffer = null;
                 (processLine as any)._toolCallMeta = null;
               } else {
                 // Multi-chunk: accumulate
                 if (!_toolCallBuffer) {
                   // Start buffering
                   (processLine as any)._toolCallBuffer = jsonData.function_call.arguments;
                   (processLine as any)._toolCallMeta = {
                     toolCallId: jsonData.id || `tool_${Date.now()}`,
                     toolName: jsonData.function_call.name
                   };
                 } else {
                   // Continue buffering
                   (processLine as any)._toolCallBuffer += jsonData.function_call.arguments;
                 }
               }
             } else {
               console.warn('[AiRelayLanguageModel] Invalid tool-call (prefix 1):', jsonData);
             }
             break;
           case 'd': // finish
             // If we have a buffered tool call, emit it now
             if ((processLine as any)._toolCallBuffer && (processLine as any)._toolCallMeta) {
               let parsedArgs;
               try {
                 parsedArgs = JSON.parse((processLine as any)._toolCallBuffer);
               } catch (e) {
                 console.error('[AiRelayLanguageModel] Failed to parse buffered tool-call arguments:', (processLine as any)._toolCallBuffer, e);
                 parsedArgs = {};
               }
               controller.enqueue({
                 type: 'tool-call',
                 toolCallType: 'function',
                 toolCallId: (processLine as any)._toolCallMeta.toolCallId,
                 toolName: (processLine as any)._toolCallMeta.toolName,
                 args: (processLine as any)._toolCallBuffer
               });
               (processLine as any)._toolCallBuffer = null;
               (processLine as any)._toolCallMeta = null;
             }
             if (jsonData.finishReason && jsonData.usage) {
                controller.enqueue({
                   type: 'finish',
                   finishReason: jsonData.finishReason as FinishReason, 
                   usage: {
                     promptTokens: jsonData.usage.promptTokens ?? 0,
                     completionTokens: jsonData.usage.completionTokens ?? 0,
                   },
                 });
             } else {
                 console.warn('[AiRelayLanguageModel] Invalid finish (prefix d):', jsonData);
             }
             break;
           case '3': // error
             controller.enqueue({ type: 'error', error: new Error(jsonData.error || JSON.stringify(jsonData)) });
             break;
           default:
             console.warn(`[AiRelayLanguageModel] Unknown prefix '${prefix}' from relay.`);
         }
       } catch (e) {
         console.error('[AiRelayLanguageModel] Failed to parse JSON from relay line:', line, e);
         controller.enqueue({ type: 'error', error: new Error(`Failed to parse JSON: ${line}`) });
       }
    }
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
} 