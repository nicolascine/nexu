import { useChat as useAIChat, type UseChatOptions } from "@ai-sdk/react";
import { type UIMessage, type CreateUIMessage } from "ai";
import { Citation } from "@/components/ChatMessage";
import { API_URL } from "@/lib/api";
import { useCallback, useMemo, useState, useEffect } from "react";

// Re-export types from the SDK for convenience
export type { UIMessage, CreateUIMessage } from "ai";

/**
 * Configuration options for the useChat hook.
 */
export interface UseChatConfig {
  /**
   * The repository ID to chat with (e.g. 'github:owner/repo').
   */
  repositoryId?: string;
  /**
   * The API endpoint for chat completions.
   */
  api?: string;
  /**
   * Callback when a message finishes streaming.
   */
  onFinish?: (message: UIMessage) => void;
  /**
   * Callback when an error occurs.
   */
  onError?: (error: Error) => void;
  /**
   * Initial messages to populate the chat.
   */
  initialMessages?: UIMessage[];
}

/**
 * Extended message type that includes citations.
 */
export interface ChatMessageWithCitations extends UIMessage {
  citations?: Citation[];
}

/**
 * Helper to extract text content from UIMessage parts.
 */
export function getMessageContent(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/**
 * Custom useChat hook that wraps the Vercel AI SDK's useChat.
 * Connects to the Nexu API for code-aware chat completions.
 *
 * Example:
 * ```tsx
 * const chat = useNexuChat({
 *   repositoryId: 'github:anthropics/anthropic-sdk-python'
 * });
 * ```
 */
export function useNexuChat(config: UseChatConfig = {}) {
  const { repositoryId, api, onFinish, onError, initialMessages } = config;

  // Build API endpoint with optional repository filter
  const endpoint = useMemo(() => {
    const base = api || `${API_URL}/api/chat`;
    if (repositoryId) {
      return `${base}?repository=${encodeURIComponent(repositoryId)}`;
    }
    return base;
  }, [api, repositoryId]);

  // Local input state management
  const [input, setInput] = useState("");

  // Track citations separately since the SDK doesn't have native citation support
  const [citations, setCitations] = useState<Map<string, Citation[]>>(new Map());

  // Create chat options
  const chatOptions: UseChatOptions<UIMessage> = useMemo(() => ({
    api: endpoint,
    initialMessages,
  }), [endpoint, initialMessages]);

  // Use the SDK's useChat hook
  const chat = useAIChat(chatOptions);

  // Destructure what we need from the chat
  const { messages, status, sendMessage, stop, error, setMessages } = chat;

  // Computed loading state
  const isLoading = status === "streaming" || status === "submitted";

  // Track when streaming completes
  useEffect(() => {
    if (status === "ready") {
      const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
      if (lastAssistantMessage) {
        onFinish?.(lastAssistantMessage);
      }
    }
  }, [status, messages, onFinish]);

  // Handle errors
  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  // Helper to get citations for a specific message
  const getCitationsForMessage = useCallback(
    (messageId: string): Citation[] => {
      return citations.get(messageId) || [];
    },
    [citations]
  );

  // Enhanced messages with citations
  const messagesWithCitations: ChatMessageWithCitations[] = useMemo(() => {
    return messages.map((message) => ({
      ...message,
      citations: message.role === "assistant" ? getCitationsForMessage(message.id) : undefined,
    }));
  }, [messages, getCitationsForMessage]);

  // Custom send handler
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      setInput("");
      sendMessage({ text: content });
    },
    [sendMessage]
  );

  // Input change handler compatible with React forms
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  // Form submit handler
  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      handleSendMessage(input);
    },
    [handleSendMessage, input]
  );

  return {
    // Messages with citations
    messages: messagesWithCitations,

    // Input state (for controlled input)
    input,
    setInput,
    handleInputChange,

    // Actions
    handleSubmit,
    handleSendMessage,
    stop,

    // Status
    isLoading,
    status,
    error,

    // Utilities
    getCitationsForMessage,
    getMessageContent,
    setMessages,
    setCitations,
  };
}

// Keep backwards compatible alias
export const useChat = useNexuChat;
