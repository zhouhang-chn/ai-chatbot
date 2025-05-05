# Vercel AI SDK Usage Guide

**Version:** 1.0
**Date:** 2025-04-30

## Introduction

This document provides guidance on how the Vercel AI SDK (specifically the `@ai-sdk/core`, `@ai-sdk/react`, etc. packages, often imported simply as `ai`) is used within this `ai-chatbot` project. Understanding these components is crucial for maintaining and debugging chat functionality, tool usage, and artifact generation.

This guide focuses on the specific patterns and potential pitfalls observed during the development and debugging of this application.

## Core Concepts & Functions Used

### 1. `streamText`

*   **Location:** Used primarily in the backend API route `app/(chat)/api/chat/route.ts`.
*   **Purpose:** This is the central function for handling streaming chat interactions with the language model. It manages the overall flow, including sending messages, receiving text/tool call chunks, executing tools, and calling back upon completion.
*   **Key Parameters:**
    *   `model`: An instance of a `LanguageModel`, provided by our custom `AiRelayProvider` which wraps the actual call to the `ai-relay-service`.
    *   `messages`: The array of messages representing the conversation history. **Crucially, the format expected by `streamText` (and its underlying provider) often differs from how messages are stored in the DB or structured in the UI state.** (See Message Structures below).
    *   `tools`: An object defining the available tools (functions) the AI can call (e.g., `createDocument`, `updateDocument`). The definitions include name, description, and parameter schema (Zod).
    *   `onFinish`: An **important** callback executed when the entire stream (including potential tool calls/results and final text generation) is complete.
        *   **Arguments:** It receives an object containing `text`, `toolCalls`, `toolResults`, `finishReason`, `usage`, and crucially, the full `response` object.
        *   **Gotcha:** Our debugging revealed that relying solely on the top-level `text`, `toolCalls`, `toolResults` arguments within `onFinish` can be unreliable for reconstructing the full assistant turn, especially when tool calls are involved. The `response.messages` array within the callback arguments proved more reliable for capturing the complete sequence of text parts, tool calls, and tool results as processed by the SDK/provider.
    *   `system`: The system prompt string.
    *   Other parameters like `maxSteps`, `experimental_activeTools`, `experimental_generateMessageId`.

### 2. `generateObject` / `generateText`

*   **Location:** Used within the artifact handlers (`artifacts/*/server.ts`) and tool implementations (`lib/ai/tools/*.ts`), specifically when a tool needs to invoke an LLM for structured data or freeform text generation (e.g., generating code for a document, updating text based on a description).
*   **Purpose:**
    *   `generateObject`: Used when the LLM is expected to return a response conforming to a specific Zod schema. It forces the LLM to use a specific "json" tool.
    *   `generateText`: Used for generating freeform text without strict schema enforcement.
*   **Key Parameters:** `model`, `system`, `prompt`, `schema` (for `generateObject`).
*   **Gotcha:** We observed that even with `generateObject`, the LLM might not perfectly adhere to the prompt's intent *within* the schema if the prompt isn't explicit enough (e.g., generating code directly instead of putting it inside the specified `code` field of the JSON object). Prompt engineering is key here. We also noted that `generateText` might be more suitable when the desired output *is* primarily text (like code), even if a tool *could* technically wrap it in JSON.

### 3. Message Structures

This was a significant source of complexity and bugs. It's vital to distinguish between these formats:

*   **DB/UI Message Structure (`UIMessage` / DB `parts`):**
    *   **Format:** Uses a nested `parts` array within each message. Tool interactions are stored within a single assistant message as a `{ type: 'tool-invocation', toolInvocation: { state: 'result', ... } }` part, combining the call and result.
    *   **Location:** Stored in the PostgreSQL `Message_v2` table (`parts` column) and used by the frontend (`useChat` hook state, `components/message.tsx`) for rendering.
*   **AI SDK Internal Message Structure (`Message`):**
    *   **Format:** The Vercel AI SDK often uses a structure closer to the standard OpenAI API format internally when processing, but the exact format passed between functions can vary. The frontend `useChat` hook also manages state using a specific internal structure.
*   **Standard API Message Structure (OpenAI Format):**
    *   **Format:** A flat list of messages. Tool calls appear in an assistant message's top-level `tool_calls` array. Tool results appear as separate messages with `role: 'tool'`.
    *   **Location:** This is the format generally expected by LLM APIs (like OpenAI's or Gemini's compatibility layer) and is the target format our `AiRelayProvider` (`prepareRelayPayload` function) converts *to* before sending requests to the `ai-relay-service`.

### 4. Tool Definition & Execution Cycle

*   **Definition:** Tools are defined in `lib/ai/tools/*.ts` using Zod schemas for parameters and passed to `streamText`.
*   **Execution:**
    1.  `streamText` sends history + tools to the LLM.
    2.  LLM responds with a request to call a tool (`tool_call` chunk).
    3.  `streamText` receives the call, pauses generation.
    4.  `streamText` executes the corresponding tool function (e.g., `createDocument.execute`).
    5.  The tool function performs its action (potentially involving DB access or *secondary* LLM calls via `generateObject`/`generateText`).
    6.  The tool function returns its result.
    7.  `streamText` sends the tool result back to the LLM.
    8.  LLM receives the result and generates the final text response.

## Key Integration Points in This Project

*   **Backend API (`app/(chat)/api/chat/route.ts`):**
    *   Loads messages from DB (nested `parts` structure).
    *   **Maps DB messages to SDK `UIMessage` format** (preserving nested `parts`) before passing to `streamText`.
    *   Calls `streamText`, providing the custom `AiRelayProvider`.
    *   In `onFinish`, **parses the `response.messages` array** (which contains separate assistant/tool messages with flat parts) to construct the **nested `tool-invocation` parts** required for saving back to the DB.
*   **AI Relay Provider (`lib/ai/providers/ai-relay-language-model.ts`):**
    *   Acts as the bridge between the AI SDK (`streamText`) and the actual Python `ai-relay-service`.
    *   The `generate` method receives the SDK message format.
    *   The `prepareRelayPayload` method is **critical**: It transforms the potentially nested SDK message format into the **flat OpenAI API message format** required by the `ai-relay-service`.
    *   The `processLine` method parses the SSE stream coming *back* from the `ai-relay-service` and translates it into the format expected by `streamText` (e.g., emitting `tool-call` and `text` parts).
*   **Frontend (`components/chat.tsx`, `useChat`):**
    *   Uses the `useChat` hook (from `@ai-sdk/react`) to manage UI state.
    *   Sends new user messages to the backend API route.
    *   Receives the streamed response (managed by `useChat`) and renders messages based on the nested `parts` structure (text, tool-invocations).
*   **Tool Implementations (`lib/ai/tools/*.ts`, `artifacts/*/server.ts`):**
    *   Define the tool schema (using Zod).
    *   Implement the `execute` function, which contains the logic for what the tool does (DB access, calling artifact handlers).
    *   Artifact handlers often use `generateObject` or `generateText` for secondary LLM calls specific to content creation/modification.

## Troubleshooting / Gotchas

*   **Message Format Mismatches:** This is the biggest area of potential confusion. Always be clear about *which* message format you are dealing with:
    *   DB/UI nested `parts` with `tool-invocation`.
    *   Flat OpenAI API format for the LLM/Relay Service.
    *   The internal format used by the `ai` package functions.
    *   Ensure transformations between these formats (in the API route loading/saving and the provider's `prepareRelayPayload`) are correct.
*   **`onFinish` Data:** Prefer parsing the `response.messages` array inside `onFinish` for constructing the final state to save, as the top-level `text`/`toolCalls`/`toolResults` might be incomplete or structured differently than expected.
*   **Tool Execution:** Debugging tool failures often requires checking:
    *   The arguments received by the tool's `execute` function.
    *   The logic within the `execute` function itself.
    *   Any secondary LLM calls (`generateObject`/`generateText`) made by the tool/artifact handler, including their specific prompts and results.
    *   The result returned by the `execute` function.
*   **`generateObject` vs. Prompting:** Remember that `generateObject` forces a JSON tool call, but the *content* within the JSON fields still depends heavily on effective system/user prompts provided to it.

## Further Information

For more comprehensive details, refer to the official [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs). 