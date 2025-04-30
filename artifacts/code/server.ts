import { z } from 'zod';
import { generateObject } from 'ai';
import { codePrompt, updateDocumentPrompt } from '@/lib/ai/prompts';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { Session } from 'next-auth';
import { AiRelayProvider } from '@/lib/ai/providers/ai-relay-provider';
import { ChatModel } from '@/lib/ai/models';

export const codeDocumentHandler = createDocumentHandler<'code'>({
  kind: 'code',
  onCreateDocument: async ({ title, dataStream, session, relayProvider, provider, baseModelId, chatId }) => {
    console.log(`[codeDocumentHandler.onCreateDocument] Starting for title: ${title}`);

    const { object } = await generateObject({
      model: relayProvider.languageModel(baseModelId, provider),
      system: codePrompt,
      prompt: title,
      schema: z.object({
        code: z.string(),
      }),
    });

    const draftContent = object.code;

    console.log(`[codeDocumentHandler.onCreateDocument] Finished generation. Content length: ${draftContent.length}`);
    console.log(`[codeDocumentHandler.onCreateDocument] Generated Content (start): ${draftContent.substring(0, 200)}...`);

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, session, relayProvider, provider, baseModelId, chatId }) => {
    console.log(`[codeDocumentHandler.onUpdateDocument] Starting for doc ID: ${document.id}`);

    const { object } = await generateObject({
      model: relayProvider.languageModel(baseModelId, provider),
      system: updateDocumentPrompt(document.content as string, 'code'),
      prompt: description,
      schema: z.object({
        code: z.string(),
      }),
    });

    const draftContent = object.code;

    console.log(`[codeDocumentHandler.onUpdateDocument] Finished generation. Content length: ${draftContent.length}`);
    console.log(`[codeDocumentHandler.onUpdateDocument] Updated Content (start): ${draftContent.substring(0, 200)}...`);

    return draftContent;
  },
});
