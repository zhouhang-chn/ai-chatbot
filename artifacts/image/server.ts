import { createDocumentHandler } from '@/lib/artifacts/server';
import { experimental_generateImage } from 'ai';
import { Session } from 'next-auth';
import { AiRelayProvider } from '@/lib/ai/providers/ai-relay-provider';
import { ChatModel } from '@/lib/ai/models';

export const imageDocumentHandler = createDocumentHandler<'image'>({
  kind: 'image',
  onCreateDocument: async ({ title, dataStream, session, relayProvider, provider, baseModelId }) => {
    let draftContent = '';

    const { image } = await experimental_generateImage({
      model: relayProvider.imageGeneration(baseModelId, provider),
      prompt: title,
      n: 1,
    });

    draftContent = image.base64;

    dataStream.writeData({
      type: 'image-delta',
      content: image.base64,
    });

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, session, relayProvider, provider, baseModelId }) => {
    let draftContent = '';

    const { image } = await experimental_generateImage({
      model: relayProvider.imageGeneration(baseModelId, provider),
      prompt: description,
      n: 1,
    });

    draftContent = image.base64;

    dataStream.writeData({
      type: 'image-delta',
      content: image.base64,
    });

    return draftContent;
  },
});
