'use client';

import type { Attachment, UIMessage } from 'ai';
import cx from 'classnames';
import type React from 'react';
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';

import { ArrowUpIcon, PaperclipIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';

/**
 * @interface PureMultimodalInputProps
 * @description Defines the props for the `PureMultimodalInput` component,
 * primarily consisting of state and handlers from the parent `Chat` component's `useChat` hook
 * and local state setters for attachments.
 */
interface PureMultimodalInputProps {
  /** Current chat ID, used for navigation on submit and passed to `SuggestedActions`. */
  chatId: string;
  /** The current value of the text input, managed by `useChat`. */
  input: UseChatHelpers['input'];
  /** Function from `useChat` to update the text input value. */
  setInput: UseChatHelpers['setInput'];
  /** Current status ('idle', 'loading', 'streaming') from `useChat`. Used to enable/disable actions. */
  status: UseChatHelpers['status'];
  /** Function from `useChat` to stop the current AI response generation. */
  stop: () => void;
  /** Array of successfully uploaded attachments, managed by `Chat` component's state. */
  attachments: Array<Attachment>;
  /** State setter function from `Chat` component to update the `attachments` array. */
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  /** Current array of messages from `useChat`. Used to conditionally show `SuggestedActions`. */
  messages: Array<UIMessage>;
  /** Function from `useChat` to update the messages array. Passed down to `PureStopButton`. */
  setMessages: UseChatHelpers['setMessages'];
  /** Function from `useChat` to append a message. Used by `SuggestedActions`. */
  append: UseChatHelpers['append'];
  /** Function from `useChat` to handle form submission (sending message + attachments). */
  handleSubmit: UseChatHelpers['handleSubmit'];
  /** Optional additional CSS class names for the outer div. */
  className?: string;
}

/**
 * @component PureMultimodalInput
 * @description Renders the primary user input area, including a dynamically resizing textarea,
 * buttons for attaching files, stopping generation, and submitting the message. It handles
 * file uploads, attachment previews, suggested actions (when chat is empty), and saving
 * input state to local storage. It's memoized by the exported `MultimodalInput` component.
 *
 * **Upstream:** Rendered by the memoized `MultimodalInput` component, which is rendered by `Chat` (`components/chat.tsx`). Receives chat state and handlers from `useChat` hook via props.
 *
 * **State Management:**
 * - Uses `useState`: Manages the local `uploadQueue` (names of files currently being uploaded).
 * - Uses `useRef`: Holds references to the `textarea` and hidden `fileInput`.
 * - Uses `useEffect`: Adjusts textarea height on mount and input change, syncs input with local storage.
 * - Uses `useLocalStorage`: Persists the text input value across sessions.
 *
 * **Downstream:**
 * - **Renders:**
 *   - `SuggestedActions` (conditionally): Shows prompt starters.
 *   - `PreviewAttachment`: Displays previews of uploaded attachments and placeholders for uploading files.
 *   - `Textarea`: The main input field.
 *   - `PureAttachmentsButton`: Button to trigger file input.
 *   - `PureStopButton` (conditionally): Button to stop AI generation.
 *   - `PureSendButton`: Button to submit the message.
 * - **Calls APIs:**
 *   - POST `/api/files/upload` via `fetch` inside `handleFileChange` to upload attachments.
 * - **Uses Hooks:**
 *   - `useWindowSize`: Adapts behavior (e.g., focus) based on screen width.
 *   - `useCallback`: Memoizes handlers like `submitForm`, `handleFileChange`, `uploadFile`.
 * - **Interacts with `useChat`:**
 *   - Reads `input`, `status`, `messages`.
 *   - Calls `setInput`, `stop`, `setMessages`, `append`, `handleSubmit`.
 * - **Other:**
 *   - Manages hidden file input (`<input type="file">`).
 *   - Handles `Enter` key press for submission.
 *   - Dynamically adjusts textarea height based on content.
 *
 * @param {PureMultimodalInputProps} props - The props containing chat state and handlers.
 * @returns {JSX.Element} The rendered multimodal input component.
 */
function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
  handleSubmit,
  className,
}: PureMultimodalInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize(); // For responsive behavior (focus)

  // Adjust textarea height initially
  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  /** Adjusts the textarea height dynamically based on its scrollHeight */
  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset height
      // Set height to scrollHeight + buffer (2px) to avoid scrollbar flicker
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  /** Resets the textarea height to its default initial size */
  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      // Note: Hardcoded height might be better derived from CSS or initial state if needed
      textareaRef.current.style.height = '98px';
    }
  };

  // Persist input value to local storage
  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    `chat-input-${chatId}`, // Use chatId for unique key per chat
    '',
  );

  // Restore input from local storage on mount (after hydration)
  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prioritize DOM value over local storage if already present (e.g., SSR or existing state)
      const finalValue = domValue || localStorageInput || '';
      if (finalValue !== input) { // Only set if different from current useChat state
         setInput(finalValue);
      }
      adjustHeight(); // Adjust height after potentially setting value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Update local storage whenever the input state changes
  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  /** Handles changes to the textarea input */
  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight(); // Adjust height as user types
  };

  // Ref for the hidden file input element
  const fileInputRef = useRef<HTMLInputElement>(null);
  // State to track files currently being uploaded (shows loading placeholders)
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  /** Submits the current input and attachments using useChat's handleSubmit */
  const submitForm = useCallback(() => {
    // Clear query params from URL if present
    window.history.replaceState({}, '', `/chat/${chatId}`);

    // Call useChat's handleSubmit, passing attachments in the options
    handleSubmit(undefined, { // Pass undefined for event as it's not a form event
      experimental_attachments: attachments,
    });

    // Clear local state after submission
    setAttachments([]);
    setLocalStorageInput('');
    resetHeight(); // Reset textarea height

    // Refocus textarea on desktop after sending
    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    attachments,
    handleSubmit,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
  ]);

  /** Uploads a single file to the backend /api/files/upload endpoint */
  const uploadFile = async (file: File): Promise<Attachment | undefined> => {
    setUploadQueue((prev) => [...prev, file.name]); // Add to upload queue for UI feedback
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/files/upload', { // API endpoint for uploads
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;
        // Return attachment object on success
        return { url, name: pathname, contentType };
      } else {
         // Handle API error response
         const { error } = await response.json();
         toast.error(error || 'File upload failed.');
         return undefined; // Indicate failure
      }
    } catch (error) {
      console.error("Upload fetch error:", error);
      toast.error('Failed to upload file, please try again!');
      return undefined; // Indicate failure
    } finally {
       // Remove from upload queue regardless of success/failure
       setUploadQueue((prev) => prev.filter(name => name !== file.name));
    }
  };

  /** Handles the file input change event when user selects files */
  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;

      try {
        // Upload all selected files concurrently
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);

        // Filter out any uploads that failed (returned undefined)
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment): attachment is Attachment => attachment !== undefined,
        );

        // Add successfully uploaded attachments to the state
        if (successfullyUploadedAttachments.length > 0) {
           setAttachments((currentAttachments) => [
             ...currentAttachments,
             ...successfullyUploadedAttachments,
           ]);
        }
      } catch (error) {
        // Should be caught within uploadFile, but safeguard here
        console.error('Error handling file uploads:', error);
        toast.error("An unexpected error occurred during file upload.");
      } finally {
         // Clear the file input value to allow selecting the same file again
         if(fileInputRef.current) {
             fileInputRef.current.value = '';
         }
      }
    },
    [setAttachments, uploadFile], // Dependency: setAttachments state setter
  );

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions append={append} chatId={chatId} />
        )}

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div
          data-testid="attachments-preview"
          className="flex flex-row gap-2 overflow-x-scroll items-end"
        >
          {attachments.map((attachment) => (
            <PreviewAttachment key={attachment.url} attachment={attachment} />
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={filename}
              attachment={{
                url: '',
                name: filename,
                contentType: '',
              }}
              isUploading={true}
            />
          ))}
        </div>
      )}

      <Textarea
        data-testid="multimodal-input"
        ref={textareaRef}
        placeholder="Send a message..."
        value={input}
        onChange={handleInput}
        className={cx(
          'min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base bg-muted pb-10 dark:border-zinc-700',
          className,
        )}
        rows={2}
        autoFocus
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();

            if (status !== 'ready') {
              toast.error('Please wait for the model to finish its response!');
            } else {
              submitForm();
            }
          }
        }}
      />

      <div className="absolute bottom-0 p-2 w-fit flex flex-row justify-start">
        <AttachmentsButton fileInputRef={fileInputRef} status={status} />
      </div>

      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
        {status === 'submitted' ? (
          <StopButton stop={stop} setMessages={setMessages} />
        ) : (
          <SendButton
            input={input}
            submitForm={submitForm}
            uploadQueue={uploadQueue}
          />
        )}
      </div>
    </div>
  );
}

// --- Child Button Components (memoized for performance) ---

/** @component PureAttachmentsButton */
const PureAttachmentsButton = memo(function PureAttachmentsButton({
  fileInputRef,
  status,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers['status'];
}) {
  return (
    <Button
      data-testid="attachments-button"
      className="rounded-md rounded-bl-lg p-[7px] h-fit dark:border-zinc-700 hover:dark:bg-zinc-900 hover:bg-zinc-200"
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      disabled={status !== 'ready'}
      variant="ghost"
    >
      <PaperclipIcon size={14} />
    </Button>
  );
});

/** @component PureStopButton */
const PureStopButton = memo(function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers['setMessages'];
}) {
  return (
    <Button
      data-testid="stop-button"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
});

/** @component PureSendButton */
const PureSendButton = memo(function PureSendButton({
  submitForm,
  input,
  uploadQueue,
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
}) {
  return (
    <Button
      data-testid="send-button"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={input.length === 0 || uploadQueue.length > 0}
    >
      <ArrowUpIcon size={14} />
    </Button>
  );
});

/**
 * @component MultimodalInput
 * @description Exported memoized version of `PureMultimodalInput`. Optimizes rendering
 * performance by preventing `PureMultimodalInput` from re-rendering if its core props
 * haven't changed. Uses `fast-deep-equal` for comparing `messages` and `attachments`.
 */
export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    // Compare relevant props
    if (prevProps.chatId !== nextProps.chatId) return false;
    if (prevProps.input !== nextProps.input) return false;
    if (prevProps.status !== nextProps.status) return false;
    if (prevProps.className !== nextProps.className) return false;
    // Deep compare potentially complex/large arrays
    if (!equal(prevProps.messages, nextProps.messages)) return false;
    if (!equal(prevProps.attachments, nextProps.attachments)) return false;
    // Compare function references (should be stable if memoized correctly in parent)
    if (prevProps.setInput !== nextProps.setInput) return false;
    if (prevProps.stop !== nextProps.stop) return false;
    if (prevProps.setAttachments !== nextProps.setAttachments) return false;
    if (prevProps.setMessages !== nextProps.setMessages) return false;
    if (prevProps.append !== nextProps.append) return false;
    if (prevProps.handleSubmit !== nextProps.handleSubmit) return false;

    // Props are considered equal, skip render
    return true;
  },
);
