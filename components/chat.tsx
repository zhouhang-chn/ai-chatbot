'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';

/**
 * @module components/chat
 * @description Provides the main chat interface component. It orchestrates message display,
 * input handling via `MultimodalInput`, interaction with the AI backend API (`/api/ai-relay`)
 * through the `useChat` hook, and rendering of related UI elements like `ChatHeader`,
 * `Messages`, and the `Artifact` panel.
 *
 * **Upstream:**
 * - Typically rendered by a dynamic route page (e.g., `app/chat/[id]/page.tsx`).
 * - Receives initial chat data (`id`, `initialMessages`), configuration (`selectedChatModel`, `selectedVisibilityType`, `isReadonly`),
 *   and user `session` information as props from the server-side component or page.
 * - Reads URL query parameters (`?query=...`) via `useSearchParams` to potentially start a chat with a specific query.
 *
 * **Downstream:**
 * - **Renders:**
 *   - `ChatHeader`: Displays chat metadata, model selector, visibility settings, and potentially actions.
 *   - `Messages`: Renders the list of chat messages, passing down message data, status, votes, and handlers.
 *   - `MultimodalInput` (if not `isReadonly`): Handles user text input, file attachments, and submission logic.
 *   - `Artifact`: Renders the side panel used for displaying tool-generated artifacts (like documents).
 * - **Uses Hooks:**
 *   - `useChat` (`@ai-sdk/react`): The core hook managing chat state (`messages`, `input`, `status`), API interaction (`handleSubmit`, `append`, `reload`, `stop`),
 *     request body preparation, and lifecycle callbacks (`onFinish`, `onError`). This hook communicates with `/api/ai-relay`.
 *   - `useSWR`: Fetches voting data for messages from `/api/vote`.
 *   - `useSWRConfig`: Used via `mutate` to trigger revalidation of the chat history list in the sidebar (`getChatHistoryPaginationKey`) upon chat completion (`onFinish`).
 *   - `useState`: Manages local state for `attachments` and `hasAppendedQuery`.
 *   - `useEffect`: Handles appending an initial query from URL parameters.
 *   - `useSearchParams`: Reads initial query from URL.
 *   - `useArtifactSelector`: Determines if the `Artifact` panel should be included in the layout calculations for the `Messages` component.
 * - **Calls APIs:**
 *   - Implicitly calls `/api/ai-relay` via `useChat`'s `handleSubmit` and `append`.
 *   - Calls `/api/vote` via `useSWR`.
 * - **Updates State:**
 *   - Updates `useChat` state via `setInput`, `append`, `setMessages` (passed down).
 *   - Updates local state via `setAttachments`, `setHasAppendedQuery`.
 *   - Updates browser history via `window.history.replaceState` after consuming URL query.
 */
export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
  session,
}: {
  /** The unique identifier for the current chat session. Crucial for `useChat` state scoping and API calls. */
  id: string;
  /** An array of `UIMessage` objects to initialize the chat state. Provided directly to `useChat`. */
  initialMessages: Array<UIMessage>;
  /** Identifier string for the selected AI model (e.g., 'openai:gpt-4', 'google:gemini-pro'). Sent to the backend via `experimental_prepareRequestBody`. */
  selectedChatModel: string;
  /** The current visibility setting ('private', 'public', etc.). Passed down to `ChatHeader`. */
  selectedVisibilityType: VisibilityType;
  /** If true, disables input fields and message actions (e.g., edit, vote, reload). Passed down to child components. */
  isReadonly: boolean;
  /** The user's session object from `next-auth`, containing user details. Passed down to `ChatHeader`. */
  session: Session;
}) {
  const { mutate } = useSWRConfig();

  /**
   * Core chat state and action handlers provided by the Vercel AI SDK React hook.
   * Manages the underlying communication with the backend API route defined for the SDK.
   */
  const {
    /** Current array of chat messages (`UIMessage[]`), including user, assistant, and tool messages/parts. */
    messages,
    /** Function to directly set the `messages` array. Passed down to children like `Messages` and `Artifact`. */
    setMessages,
    /**
     * Function to handle form submission. Typically called by `MultimodalInput`.
     * Sends the current `input` value and `messages` history (plus attachments via `experimental_prepareRequestBody`)
     * to the backend API route (`/api/ai-relay`).
     */
    handleSubmit,
    /** The current value of the user input controlled by `MultimodalInput`. */
    input,
    /** Function to update the `input` state. Passed to `MultimodalInput` and `Artifact`. */
    setInput,
    /**
     * Function to append a new message to the chat history and trigger an API call.
     * Used here for initial query appending and passed down to `MultimodalInput`/`Artifact`.
     * @param message The message object (`UserMessage` or similar) to append.
     * @param options Optional `ChatRequestOptions`.
     */
    append,
    /** Current status of the AI interaction: 'idle', 'loading' (waiting for response), 'streaming' (receiving response). Passed down to children. */
    status,
    /** Function to abort the current streaming AI response. Passed down to `MultimodalInput`/`Artifact`. */
    stop,
    /** Function to re-request the last assistant response. Passed down to `Messages`/`Artifact`. */
    reload,
  } = useChat({
    /** Associates the hook's state with this specific chat ID. */
    id,
    /** Initializes the message history. */
    initialMessages,
    /** (Experimental) Sets a minimum interval (ms) between message updates during streaming. Helps manage re-renders. */
    experimental_throttle: 100,
    /** Ensures that fields beyond basic role/content (like `toolInvocations`, `attachments`) are included in the `messages` passed to `experimental_prepareRequestBody` and potentially the API. */
    sendExtraMessageFields: true,
    /** Provides a custom function (`@/lib/utils/generateUUID`) to generate unique IDs for new messages added by the user or assistant. */
    generateId: generateUUID,
    /**
     * (Experimental) A function to modify the request body just before it's sent by `handleSubmit` or `append` to the backend API (`/api/ai-relay`).
     * **Purpose:** Adds chat-specific context (`id`, `selectedChatModel`) alongside the latest message,
     * potentially simplifying the backend API route logic.
     * **Upstream Data:** Receives the default request `body` object prepared by `useChat`, containing the full `messages` array.
     * **Downstream Call:** The returned object becomes the actual JSON body sent via `fetch` to `/api/ai-relay/route.ts`.
     * @param {ChatRequest} body - The default request body prepared by `useChat`.
     * @returns {object} The modified request body to be sent.
     */
    experimental_prepareRequestBody: (body) => ({
      id, // Include chat ID
      message: body.messages.at(-1), // Send only the *latest* message in this field for this specific backend implementation
      selectedChatModel, // Include selected model
      // Note: Attachments are handled separately by useChat and added to the FormData if present.
    }),
    /**
     * Callback function executed when the AI response stream finishes successfully.
     * **Purpose:** Triggers a revalidation of the chat history data used by the sidebar, ensuring the history list updates.
     * **Downstream Effect:** Calls SWR's `mutate` function with the cache key (`getChatHistoryPaginationKey`) for the sidebar's chat history query.
     */
    onFinish: () => {
      // Revalidate the swr cache for chat history
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    /**
     * Callback function executed if an error occurs during the API call or stream processing managed by `useChat`.
     * **Purpose:** Displays a user-friendly error notification.
     * **Downstream Effect:** Calls the `toast` component function to show an error message.
     * @param {Error} error - The error object caught by `useChat`.
     */
    onError: (error) => {
      toast({
        type: 'error',
        description: error.message,
      });
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      append({
        role: 'user',
        content: query,
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, append, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={selectedChatModel}
          selectedVisibilityType={selectedVisibilityType}
          isReadonly={isReadonly}
          session={session}
        />

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              append={append}
            />
          )}
        </form>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
      />
    </>
  );
}
