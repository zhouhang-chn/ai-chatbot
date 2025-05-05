# Database Design

**Version:** 1.0
**Date:** 2025-04-30

## Introduction

This document outlines the PostgreSQL database schema design used by the `ai-chatbot` application. The schema is managed using [Drizzle ORM](https://orm.drizzle.team/).

## Schema Definitions

### 1. `User` Table (`User`)

Stores information about registered users.

| Column     | Data Type           | Constraints                        | Description                 |
| :--------- | :------------------ | :--------------------------------- | :-------------------------- |
| `id`       | `uuid`              | Primary Key, Not Null, Default Random | Unique identifier for the user |
| `email`    | `varchar(64)`       | Not Null                           | User's email address        |
| `password` | `varchar(64)`       | Nullable                           | Hashed password (if used)   |

### 2. `Chat` Table (`Chat`)

Stores metadata for each chat session.

| Column              | Data Type                  | Constraints                       | Description                                     |
| :------------------ | :------------------------- | :-------------------------------- | :---------------------------------------------- |
| `id`                | `uuid`                     | Primary Key, Not Null, Default Random | Unique identifier for the chat                  |
| `createdAt`         | `timestamp`                | Not Null                          | Timestamp when the chat was created             |
| `title`             | `text`                     | Not Null                          | Title of the chat (often AI-generated)          |
| `userId`            | `uuid`                     | Not Null, Foreign Key (`User.id`) | ID of the user who owns the chat                |
| `selectedChatModel` | `text`                     | Nullable                          | Identifier of the AI model used for this chat   |
| `visibility`        | `varchar` (`public`/`private`) | Not Null, Default `'private'`     | Visibility status of the chat (future use?) |

### 3. `Message` Table (`Message_v2`)

Stores individual messages within a chat, including their structured parts.

| Column      | Data Type   | Constraints                       | Description                                |
| :---------- | :---------- | :-------------------------------- | :----------------------------------------- |
| `id`        | `uuid`      | Primary Key, Not Null, Default Random | Unique identifier for the message            |
| `chatId`    | `uuid`      | Not Null, Foreign Key (`Chat.id`) | ID of the chat this message belongs to       |
| `role`      | `varchar`   | Not Null                          | Role of the sender (`user` or `assistant`) |
| `parts`     | `json`      | Not Null                          | JSON array containing structured message parts (see structure below) |
| `attachments` | `json`      | Not Null                          | JSON array for message attachments (future use?) |
| `createdAt` | `timestamp` | Not Null                          | Timestamp when the message was created       |

**`parts` Column JSON Structure:**

The `parts` column stores an array of objects, each representing a piece of the message content. Based on the working examples and application logic, the key structures stored are:

*   **Text Part:**
    ```json
    { "type": "text", "text": "The message content..." }
    ```
*   **Tool Invocation Part (Nested Structure):** This structure represents a completed tool interaction (both the call and its result) as observed in the working DB logs.
    ```json
    {
      "type": "tool-invocation",
      "toolInvocation": {
        "state": "result", // Indicates the tool call is complete
        "step": number, // Optional step number (if UI uses it)
        "toolCallId": "string", // ID linking call and result
        "toolName": "string", // Name of the tool called
        "args": object, // Arguments passed to the tool
        "result": object // Result returned by the tool
      }
    }
    ```
*   **Step Start Part:** Used by the UI for visual grouping.
    ```json
    { "type": "step-start" }
    ```

### 4. `Document` Table (`Document`)

Stores artifacts created or managed during chats (e.g., code snippets, essays).

| Column      | Data Type                          | Constraints                               | Description                                      |
| :---------- | :--------------------------------- | :---------------------------------------- | :----------------------------------------------- |
| `id`        | `uuid`                             | Part of Composite Primary Key, Not Null, Default Random | Unique identifier for the document version       |
| `createdAt` | `timestamp`                        | Part of Composite Primary Key, Not Null   | Timestamp of this document version               |
| `title`     | `text`                             | Not Null                                  | Title of the document                            |
| `content`   | `text`                             | Nullable                                  | The main content of the document (code, text)    |
| `kind`      | `varchar` (`text`/`code`/`image`/`sheet`) | Not Null, Default `'text'`            | The type of artifact                             |
| `userId`    | `uuid`                             | Not Null, Foreign Key (`User.id`)         | ID of the user who owns the document           |
| `chatId`    | `uuid`                             | Nullable, Foreign Key (`Chat.id`)         | ID of the chat associated with this document | 

*(Note: The composite primary key on `id` and `createdAt` might imply versioning, though current usage seems to treat `id` as the main identifier)*

### 5. `Vote` Table (`Vote_v2`)

Stores user feedback (upvotes/downvotes) on specific messages.

| Column     | Data Type | Constraints                                  | Description                                      |
| :--------- | :-------- | :------------------------------------------- | :----------------------------------------------- |
| `chatId`   | `uuid`    | Part of Composite Primary Key, Not Null, Foreign Key (`Chat.id`) | ID of the chat containing the voted message    |
| `messageId`| `uuid`    | Part of Composite Primary Key, Not Null, Foreign Key (`Message_v2.id`) | ID of the message being voted on             |
| `isUpvoted`| `boolean` | Not Null                                     | `true` for upvote, `false` for downvote        |

### 6. `Suggestion` Table (`Suggestion`)

Stores suggestions for document edits (likely for a future feature).

| Column            | Data Type   | Constraints                                      | Description                               |
| :---------------- | :---------- | :----------------------------------------------- | :---------------------------------------- |
| `id`              | `uuid`      | Primary Key, Not Null, Default Random            | Unique identifier for the suggestion        |
| `documentId`      | `uuid`      | Not Null, Part of Composite Foreign Key (`Document`) | ID of the document the suggestion applies to |
| `documentCreatedAt`| `timestamp` | Not Null, Part of Composite Foreign Key (`Document`) | Creation timestamp of the document version |
| `originalText`    | `text`      | Not Null                                         | Original text being suggested for change    |
| `suggestedText`   | `text`      | Not Null                                         | The suggested replacement text              |
| `description`     | `text`      | Nullable                                         | Optional description of the suggestion    |
| `isResolved`      | `boolean`   | Not Null, Default `false`                        | Whether the suggestion has been addressed     |
| `userId`          | `uuid`      | Not Null, Foreign Key (`User.id`)                | ID of the user related to the suggestion  |
| `createdAt`       | `timestamp` | Not Null                                         | Timestamp when the suggestion was created   |

## Relationships

-   `User` (1) -> `Chat` (Many)
-   `Chat` (1) -> `Message` (Many)
-   `User` (1) -> `Document` (Many)
-   `Chat` (1) -> `Document` (Many) (Optional relationship)
-   `Chat` (1) -> `Vote` (Many)
-   `Message` (1) -> `Vote` (Many)
-   `User` (1) -> `Suggestion` (Many)
-   `Document` (1) -> `Suggestion` (Many)

## Data Examples

**User:**
```json
{
  "id": "235049eb-15ee-4a2a-9d7f-6189e9bd956e",
  "email": "test@example.com",
  "password": null
}
```

**Chat:**
```json
{
  "id": "605559b5-9721-46e6-b052-a3084543110d",
  "createdAt": "2025-04-30T08:39:46.605Z",
  "title": "Dijkstra Algorithm in Python",
  "userId": "235049eb-15ee-4a2a-9d7f-6189e9bd956e",
  "selectedChatModel": "google-gemini-2.0-flash-exp-image-generation",
  "visibility": "private"
}
```

**Message (Assistant with Tool Result):**
```json
{
  "id": "afa59c46-e2de-4ba2-abd6-c279d117f805",
  "chatId": "605559b5-9721-46e6-b052-a3084543110d",
  "role": "assistant",
  "parts": [
    { "type": "step-start" },
    { "type": "text", "text": "OK. I can help with that." },
    {
      "type": "tool-invocation",
      "toolInvocation": {
        "state": "result",
        "step": 0,
        "toolCallId": "generated_0",
        "toolName": "createDocument",
        "args": {
          "title": "Dijkstra Algorithm in Python",
          "kind": "code"
        },
        "result": {
          "id": "ad671307-2c08-40fb-b183-9d7dafac8cc9",
          "title": "Dijkstra Algorithm in Python",
          "kind": "code",
          "content": "A document (id: ad671307-...) was created..."
        }
      }
    },
    { "type": "step-start" },
    { "type": "text", "text": "OK. I've created a document..." }
  ],
  "attachments": [],
  "createdAt": "2025-04-30T08:39:49.492Z"
}
```

**Document (Code Artifact):**
```json
{
  "id": "ad671307-2c08-40fb-b183-9d7dafac8cc9",
  "createdAt": "2025-04-30T08:39:49.000Z", // Approx. creation time
  "title": "Dijkstra Algorithm in Python",
  "content": "import heapq\n\ndef dijkstra(graph, start):\n    # ... rest of the code ...",
  "kind": "code",
  "userId": "235049eb-15ee-4a2a-9d7f-6189e9bd956e",
  "chatId": "605559b5-9721-46e6-b052-a3084543110d"
}
``` 