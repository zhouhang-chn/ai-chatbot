import { z } from 'zod';

const textPartSchema = z.object({
  text: z.string().min(1).max(2000),
  type: z.enum(['text']),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    createdAt: z.coerce.date(),
    role: z.enum(['user']),
    content: z.string().min(1).max(2000),
    parts: z.array(textPartSchema),
    experimental_attachments: z
      .array(
        z.object({
          url: z.string().url(),
          name: z.string().min(1).max(2000),
          contentType: z.enum(['image/png', 'image/jpg', 'image/jpeg']),
        }),
      )
      .optional(),
  }),
  selectedChatModel: z.enum([
    'grok-2-vision',
    'grok-3-mini-reasoning',
    'openai-gpt-4o',
    'openai-gpt-4o-reasoning',
    'google-gemini-1.5-pro',
    'google-gemini-1.5-pro-reasoning',
  ]),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
