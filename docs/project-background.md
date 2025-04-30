# Project Background Summary

This project involves the development and debugging of an AI chatbot application.

**Core Technologies:**

*   **Frontend:** Next.js, TypeScript, React
*   **AI Integration:** Vercel AI SDK (`@ai-sdk/*` packages, which is not a project folder, it's for code read only)
*   **Backend:** Next.js API Routes, TypeScript
*   **Database:** PostgreSQL with Drizzle ORM
*   **AI Relay:** A custom Python-based AI relay service (`ai-relay-service`) to interface with various LLM providers (tested primarily with Google Gemini via its OpenAI compatibility layer).

**Key Features & Components:**

*   **Chat Interface:** Standard chatbot UI.
*   **Artifacts Panel:** A dedicated UI section alongside the chat to display generated content (code, text) created by the LLM.
*   **LLM Tools:** Uses the Vercel AI SDK's tooling capabilities. Key tools implemented and discussed include:
    *   `createDocument`: Creates an entry in the database and is intended to trigger content generation for the Artifacts panel.
    *   `updateDocument`: Modifies an existing document/artifact based on user requests.
    *   Other tools like `getWeather`, `requestSuggestions` were also present.
*   **Database Schema:** Includes tables for `Chat`, `Message` (storing structured message `parts` including text, tool calls, and tool results), and `Document` (linked to `Chat` via `chatId`).
*   **Custom Provider:** `AiRelayLanguageModel` implements the AI SDK's `LanguageModelV1` interface to route requests through the custom Python relay service.

**Development Goal:**

The code was changed from ai-chatbot-original (`@ai-chatbot-original/*`, again it's for code read only). The changes we made is try to move LLM interaction part from Typescript to a Python based service ai-relay-service.
