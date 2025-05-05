import type { UIMessage } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Greeting } from './greeting';
import { memo } from 'react';
import type { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';

/**
 * @interface MessagesProps
 * @description Defines the props accepted by the `PureMessages` component,
 * primarily passed down from the parent `Chat` component.
 */
interface MessagesProps {
  /** The ID of the current chat session. Passed down to children like `PreviewMessage` for context. */
  chatId: string;
  /** The current status of the chat interaction ('idle', 'loading', 'streaming', 'submitted') from `useChat`. Used to determine loading/thinking states. */
  status: UseChatHelpers['status'];
  /** An array of vote objects fetched via SWR, associated with messages in this chat, or undefined if not loaded/available. Passed to `PreviewMessage`. */
  votes: Array<Vote> | undefined;
  /** The array of message objects (`UIMessage[]`) from `useChat` state to be displayed. */
  messages: Array<UIMessage>;
  /** Function from `useChat` to update the messages array (e.g., after voting or editing). Passed to `PreviewMessage`. */
  setMessages: UseChatHelpers['setMessages'];
  /** Function from `useChat` to reload/regenerate the last AI response. Passed to `PreviewMessage`. */
  reload: UseChatHelpers['reload'];
  /** Indicates if the chat interface is in read-only mode. Passed down to `PreviewMessage`. */
  isReadonly: boolean;
  /** Flag indicating if the artifact panel is currently visible. Used solely for memoization logic in the `Messages` wrapper. */
  isArtifactVisible: boolean;
}

/**
 * @component PureMessages
 * @description Renders the scrollable list of chat messages. It handles mapping over the
 * `messages` array, displaying an initial `Greeting` if empty, rendering each message
 * using `PreviewMessage`, showing a `ThinkingMessage` indicator while the AI is processing,
 * and managing auto-scrolling to the bottom using the `useScrollToBottom` hook.
 * This component focuses purely on presentation based on the props received.
 *
 * **Upstream:** Rendered by the memoized `Messages` component, which is rendered by `Chat` (`components/chat.tsx`). Receives chat state (`messages`, `status`, `votes`) and handlers (`setMessages`, `reload`) as props.
 *
 * **Downstream:**
 * - Renders `Greeting`: Displays an initial placeholder if the chat is empty.
 * - Renders `PreviewMessage` for each message in the `messages` array: Handles the display of individual messages.
 * - Renders `ThinkingMessage`: Shows a loading indicator when the AI is processing (`status === 'submitted').
 * - Uses `useScrollToBottom` hook: Attaches refs to manage scrolling to the latest message.
 *
 * @param {MessagesProps} props - The props containing message data, status, and handlers.
 * @returns {JSX.Element} The rendered list container for chat messages.
 */
function PureMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  reload,
  isReadonly,
}: MessagesProps) {
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
    >
      {messages.length === 0 && <Greeting />}

      {messages.map((message, index) => (
        <PreviewMessage
          key={message.id}
          chatId={chatId}
          message={message}
          isLoading={status === 'streaming' && messages.length - 1 === index}
          vote={
            votes
              ? votes.find((vote) => vote.messageId === message.id)
              : undefined
          }
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      {status === 'submitted' &&
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' && <ThinkingMessage />}

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

/**
 * @component Messages
 * @description Exported memoized version of `PureMessages`. This component optimizes
 * rendering performance by preventing `PureMessages` from re-rendering if its props
 * haven't meaningfully changed. It uses `fast-deep-equal` for efficient deep comparison
 * of the `messages` and `votes` arrays.
 *
 * **Optimization Logic:**
 * - Skips render if only `isArtifactVisible` changes *while it's already visible* (avoids re-render just for artifact panel toggling).
 * - Triggers render if `status` changes.
 * - Triggers render if message count changes (cheap check before deep compare).
 * - Triggers render if `messages` array content changes (deep comparison).
 * - Triggers render if `votes` array content changes (deep comparison).
 * - Otherwise, assumes props are equal and skips the render of `PureMessages`.
 */
export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) return true;

  if (prevProps.status !== nextProps.status) return false;

  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;

  return true;
});
