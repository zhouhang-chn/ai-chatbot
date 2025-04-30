import { sheetPrompt, updateDocumentPrompt } from '@/lib/ai/prompts';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { streamObject } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { AiRelayProvider } from '@/lib/ai/providers/ai-relay-provider';
import { ChatModel } from '@/lib/ai/models';

export const sheetDocumentHandler = createDocumentHandler<'sheet'>({
  kind: 'sheet',
  onCreateDocument: async ({ title, dataStream, session, relayProvider, provider, baseModelId }) => {
    let draftContent = '';

    const { partialObjectStream } = streamObject({
      model: relayProvider.languageModel(baseModelId, provider),
      system: sheetPrompt,
      prompt: title,
      schema: z.object({
        sheet: z.array(z.record(z.string())),
      }),
    });

    let lastSentContent = '';
    for await (const partialObject of partialObjectStream) {
      if (partialObject?.sheet) {
        const currentJsonString = JSON.stringify(partialObject.sheet);
        if (currentJsonString !== lastSentContent) {
          const deltaContent = currentJsonString.substring(lastSentContent.length);
          draftContent = currentJsonString;
          lastSentContent = currentJsonString;
          if (deltaContent) {
            dataStream.writeData({
              type: 'text-delta',
              content: deltaContent,
            });
          }
        }
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, session, relayProvider, provider, baseModelId }) => {
    let draftContent = '';

    const { partialObjectStream } = streamObject({
      model: relayProvider.languageModel(baseModelId, provider),
      system: updateDocumentPrompt(document.content, 'sheet'),
      prompt: description,
      schema: z.object({
        sheet: z.array(z.record(z.string())),
      }),
    });

    let lastSentContent = '';
    for await (const partialObject of partialObjectStream) {
      if (partialObject?.sheet) {
        const currentJsonString = JSON.stringify(partialObject.sheet);
        if (currentJsonString !== lastSentContent) {
          const deltaContent = currentJsonString.substring(lastSentContent.length);
          draftContent = currentJsonString;
          lastSentContent = currentJsonString;
          if (deltaContent) {
            dataStream.writeData({
              type: 'text-delta',
              content: deltaContent,
            });
          }
        }
      }
    }

    return draftContent;
  },
});
