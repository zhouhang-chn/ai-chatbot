import { z } from 'zod';

// Schema for the createDocument tool's arguments
export const createDocumentArgumentsSchema = z.object({
  name: z
    .string()
    .describe("The filename for the document (e.g., 'dijkstra_algorithm.py')."),
  content: z.string().describe("The content/code for the document."),
});

// Schema definition in OpenAI/AI SDK tool format
export const createDocumentToolSchema = {
  type: 'function' as const,
  function: {
    name: 'createDocument',
    description:
      'Creates a new document artifact with the given name and content.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            "The filename for the document (e.g., 'dijkstra_algorithm.py').",
        },
        content: {
          type: 'string',
          description: 'The content/code for the document.',
        },
      },
      required: ['name', 'content'],
    },
  },
};

// Define other tool schemas similarly if needed...
// e.g., updateDocument, requestSuggestions, getWeather 