'use client';

import type { UIMessage } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';
import type { Vote } from '@/lib/db/schema';
import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon } from './icons';
import { Markdown } from './markdown';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import type { UseChatHelpers } from '@ai-sdk/react';

/**
 * @interface PurePreviewMessageProps
 * @description Defines the props for the `PurePreviewMessage` component, passed down from `Messages`.
 */
interface PurePreviewMessageProps {
  /** ID of the current chat session. Passed down to child components like `MessageActions`. */
  chatId: string;
  /** The specific message object (`UIMessage`) to render, containing role, ID, and an array of `parts`. */
  message: UIMessage;
  /** The vote status (`Vote` object or undefined) for this specific message. Passed to `MessageActions`. */
  vote: Vote | undefined;
  /** Boolean indicating if this message is the last one in the list and currently being streamed (`status === 'streaming'`). Passed down to children like `MessageReasoning` and `MessageActions`. */
  isLoading: boolean;
  /** Function from `useChat` to update the messages array. Primarily used by `MessageEditor` to save edits. */
  setMessages: UseChatHelpers['setMessages'];
  /** Function from `useChat` to reload the last AI response. Primarily used by `MessageEditor`. */
  reload: UseChatHelpers['reload'];
  /** Boolean indicating if the chat is in read-only mode. Disables editing and actions. */
  isReadonly: boolean;
}

/**
 * @component PurePreviewMessage
 * @description Renders a single message bubble within the chat log. It handles different message roles (user/assistant)
 * for styling/layout, displays various message parts (text, attachments, tool calls/results, reasoning steps)
 * by mapping over the `message.parts` array, and manages view/edit modes for user text messages.
 * This is the core component responsible for the visual representation of a message and its contents.
 * It's memoized by the exported `PreviewMessage` component for performance optimization.
 *
 * **Upstream:** Rendered within a loop by `Messages` component (`components/messages.tsx`). Receives a single `message` object and related state/handlers as props.
 *
 * **Downstream:**
 * - **Renders:**
 *   - `PreviewAttachment` (if `message.experimental_attachments` exist).
 *   - Iterates through `message.parts`:
 *     - `MessageReasoning` (for 'reasoning' parts).
 *     - `Markdown` (for 'text' parts in view mode).
 *     - `MessageEditor` (for 'text' parts in edit mode).
 *     - Tool-Specific Components (`Weather`, `DocumentPreview`, `DocumentToolCall`, `DocumentToolResult`) for 'tool-invocation' parts based on `toolName` and `state` ('call' or 'result').
 *   - `MessageActions` (if not `isReadonly`): Displays voting/copy actions.
 * - **Uses Hooks:**
 *   - `useState`: Manages the local `mode` ('view' or 'edit') for user text messages.
 * - **Uses Libraries:**
 *   - `framer-motion`: For entry animation.
 *   - `classnames`/`cn`: For conditional styling.
 *   - `@/components/ui/*`: For UI elements like `Button`, `Tooltip`.
 *
 * @param {PurePreviewMessageProps} props - The props for the component.
 * @returns {JSX.Element | null} The rendered message element or null.
 */
const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  reload,
  isReadonly,
}: PurePreviewMessageProps) => {
  // State to control if the user message text is being viewed or edited.
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  // Log the received message parts for debugging
  console.log(`[PreviewMessage] Rendering message ${message.id} (Role: ${message.role}):`, message.parts);

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {message.experimental_attachments &&
              message.experimental_attachments.length > 0 && (
                <div
                  data-testid={`message-attachments`}
                  className="flex flex-row justify-end gap-2"
                >
                  {message.experimental_attachments.map((attachment) => (
                    <PreviewAttachment
                      key={attachment.url}
                      attachment={attachment}
                    />
                  ))}
                </div>
              )}

            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (type === 'reasoning') {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={part.reasoning}
                  />
                );
              }

              if (type === 'text') {
                if (mode === 'view') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      {message.role === 'user' && !isReadonly && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="message-edit-button"
                              variant="ghost"
                              className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                              onClick={() => {
                                setMode('edit');
                              }}
                            >
                              <PencilEditIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit message</TooltipContent>
                        </Tooltip>
                      )}

                      <div
                        data-testid="message-content"
                        className={cn('flex flex-col gap-4', {
                          'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                            message.role === 'user',
                        })}
                      >
                        <Markdown>{part.text}</Markdown>
                      </div>
                    </div>
                  );
                }

                if (mode === 'edit') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      <div className="size-8" />

                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        reload={reload}
                      />
                    </div>
                  );
                }
              }

              if (type === 'tool-invocation') {
                const { toolInvocation } = part;
                const { toolName, toolCallId, state } = toolInvocation;

                if (state === 'call') {
                  const { args } = toolInvocation;

                  return (
                    <div
                      key={toolCallId}
                      className={cx({
                        skeleton: ['getWeather'].includes(toolName),
                      })}
                    >
                      {toolName === 'getWeather' ? (
                        <Weather />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview isReadonly={isReadonly} args={args} />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolCall
                          type="update"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolCall
                          type="request-suggestions"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : null}
                    </div>
                  );
                }

                if (state === 'result') {
                  const { result } = toolInvocation;

                  return (
                    <div key={toolCallId}>
                      {toolName === 'getWeather' ? (
                        <Weather weatherAtLocation={result} />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview
                          isReadonly={isReadonly}
                          result={result}
                        />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolResult
                          type="update"
                          result={result}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolResult
                          type="request-suggestions"
                          result={result}
                          isReadonly={isReadonly}
                        />
                      ) : (
                        <pre>{JSON.stringify(result, null, 2)}</pre>
                      )}
                    </div>
                  );
                }
              }
            })}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * @component PreviewMessage
 * @description Memoized version of `PurePreviewMessage`. Optimizes rendering by preventing
 * updates if the core message data (ID, parts, vote) or loading state hasn't changed.
 * Uses `fast-deep-equal` for efficiently comparing the potentially complex `message.parts` array and `vote` objects.
 */
export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return true;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full mx-auto max-w-3xl px-4 group/message "
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Hmm...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
