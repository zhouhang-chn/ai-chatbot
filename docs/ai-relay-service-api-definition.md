# AI Relay Service API Definition

**Version:** 1.0
**Date:** 2025-04-30

## Introduction

This document defines the RESTful API interface provided by the `ai-relay-service` (Python backend) for consumption by the frontend (Next.js/TypeScript).
The purpose of this service is to act as a standardized layer between the frontend and various underlying Large Language Model (LLM) providers, handling tasks like request formatting, streaming, and potentially result caching or logging.

## Base URL

The base URL for the AI Relay Service is assumed to be configured via the `AI_RELAY_SERVICE_URL` environment variable in the frontend (e.g., `http://localhost:8001`). All endpoints defined below are relative to `/api/v1` under this base URL.

## Common Data Structures

These structures are based on the OpenAI API format, which the relay service generally adheres to for its inputs and outputs where applicable.

**Message Object:**

```typescript
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string; // Optional: Tool name if role is 'tool'
  tool_call_id?: string; // Optional: ID if role is 'tool'
  tool_calls?: ToolCall[]; // Optional: Present if role is 'assistant'
}

interface ToolCallFunction {
  name?: string;
  arguments?: string; // Stringified JSON arguments
}

interface ToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}
```

**Tool Definition Object:**

```typescript
interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: object; // JSON Schema object describing the function parameters
  };
}
```

## Endpoints

### 1. Chat Completions Stream

Handles the primary interaction for generating chat responses, including text and tool calls, delivered via a stream.

*   **Path:** `/api/v1/chat/stream`
*   **Method:** `POST`
*   **Content-Type:** `application/json`
*   **Purpose:** Sends a chat history and configuration to the relay service to get a streamed LLM response.

**Request Body:**

```json
{
  "provider": "string", // e.g., "google", "openai"
  "base_model_id": "string", // e.g., "gemini-2.0-flash-exp-image-generation"
  "messages": [Message], // Array of Message objects (OpenAI format)
  "tools": [Tool] | null, // Optional: Array of available Tool definitions
  "tool_choice": "string" | object | null, // Optional: e.g., "auto", "none", { type: "function", function: { name: "..." } }
  "system_prompt": "string" | null, // Optional: System prompt string
  "temperature": "number" | null, // Optional: Sampling temperature
  // Other optional LLM parameters (e.g., max_tokens, top_p) could be added here
}
```

**Example Request Body:**

```json
{
  "provider": "google",
  "base_model_id": "gemini-2.0-flash-exp-image-generation",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What is the weather in London?" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "getWeather",
        "description": "Get the current weather at a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string", "description": "The city and state/country, e.g. San Francisco, CA" }
          },
          "required": ["location"]
        }
      }
    }
  ],
  "tool_choice": "auto",
  "system_prompt": null,
  "temperature": 0.7
}
```

**Response:**

*   **Content-Type:** `text/event-stream`
*   **Format:** Server-Sent Events (SSE). Each event has a `data` field containing a JSON string.

**Example Response Event Stream:**

```text
data: {"type":"text","content":"Okay, I can help with that. "}

data: {"type":"tool_call","tool_call_id":"call_abc123","tool_name":"getWeather","args":"{\\"location\\":\\"London, UK\\"}"}

data: {"type":"finish","reason":"tool_calls","usage":{"prompt_tokens":50,"completion_tokens":20,"total_tokens":70}}
```

*(Note: In a subsequent call after the tool result is provided, the stream might contain just text and a finish event)*

```text
data: {"type":"text","content":"The weather in London is currently "}

data: {"type":"text","content":"sunny with a high of 20°C."}

data: {"type":"finish","reason":"stop","usage":{"prompt_tokens":100,"completion_tokens":15,"total_tokens":115}}
```

### 2. Generate Title

Generates a concise title for a chat based on the initial user message.

*   **Path:** `/generate/title`
*   **Method:** `POST`
*   **Content-Type:** `application/json`
*   **Purpose:** Requests a title suggestion for a new chat.

**Request Body:**

```json
{
  "provider": "string",
  "base_model_id": "string",
  "message_content": "string" // The content of the first user message
}
```

**Example Request Body:**

```json
{
  "provider": "google",
  "base_model_id": "gemini-2.0-flash-exp-image-generation",
  "message_content": "Write Python code to demonstrate Dijkstra's algorithm for finding the shortest path in a graph."
}
```

**Response (Success):**

*   **Status Code:** `200 OK`
*   **Content-Type:** `application/json`
*   **Body:**
    ```json
    { "title": "Generated Chat Title" }
    ```

**Example Success Response Body:**

```json
{ "title": "Dijkstra's Algorithm in Python" }
```

**Response (Error):**

*   **Status Code:** `4xx` or `5xx`
*   **Content-Type:** `application/json`
*   **Body:**
    ```json
    { "error": "Error description" }
    ```

**Example Error Response Body:**

```json
{ "error": "Model provider connection failed." }
```

## Authentication / Authorization

Authentication and authorization are handled by the primary Next.js application *before* requests are forwarded to the AI Relay Service. The relay service itself currently assumes requests are already authorized. 