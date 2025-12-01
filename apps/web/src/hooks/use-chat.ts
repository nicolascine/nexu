import { Citation } from "@/components/ChatMessage";
import { API_URL } from "@/lib/api";
import { useCallback, useRef, useState } from "react";

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts: Array<{ type: "text"; text: string }>;
  citations?: Citation[];
}

export interface UseChatConfig {
  repositoryId?: string;
  githubUrl?: string;
  defaultBranch?: string;
  api?: string;
  onFinish?: (message: UIMessage) => void;
  onError?: (error: Error) => void;
  initialMessages?: UIMessage[];
}

export interface ChatMessageWithCitations extends UIMessage {
  citations?: Citation[];
}

export function getMessageContent(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function useNexuChat(config: UseChatConfig = {}) {
  const { repositoryId, githubUrl, defaultBranch = "main", api, onFinish, onError, initialMessages = [] } = config;

  const [messages, setMessages] = useState<ChatMessageWithCitations[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Build API endpoint
  const endpoint = api || `${API_URL}/api/chat`;

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessageWithCitations = {
        id: generateId(),
        role: "user",
        content,
        parts: [{ type: "text", text: content }],
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);
      setError(null);

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            options: repositoryId ? { repository: repositoryId } : undefined,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const assistantMessage: ChatMessageWithCitations = {
          id: generateId(),
          role: "assistant",
          content: "",
          parts: [{ type: "text", text: "" }],
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Read streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let fullContent = "";
        let citations: Citation[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            // Parse Vercel AI SDK streaming format
            // 0:"text" - text content
            // 2:[data] - data/chunks (contains code chunks from retrieval)
            // d:{...} - done signal
            if (line.startsWith("0:")) {
              try {
                const text = JSON.parse(line.slice(2));
                fullContent += text;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: fullContent,
                      parts: [{ type: "text", text: fullContent }],
                      citations, // Include citations
                    };
                  }
                  return updated;
                });
              } catch (e) {
                // Ignore parse errors
                console.error(e);
              }
            } else if (line.startsWith("2:")) {
              // Parse chunks data and convert to citations
              try {
                const dataArray = JSON.parse(line.slice(2));
                const chunksData = dataArray.find((d: any) => d.type === "chunks");
                if (chunksData?.data) {
                  citations = chunksData.data.map((chunk: any, index: number) => {
                    // const baseUrl = githubUrl || `https://github.com/${chunk.filepath.split('/')[0]}`; 
                    const url = githubUrl 
                      ? `${githubUrl}/blob/${defaultBranch}/${chunk.filepath}#L${chunk.startLine}-L${chunk.endLine}`
                      : `https://github.com/${chunk.filepath}#L${chunk.startLine}-L${chunk.endLine}`;
                    
                    return {
                      id: `citation-${index}`,
                      file: chunk.filepath,
                      lines: `${chunk.startLine}-${chunk.endLine}`,
                      code: chunk.content || "",
                      url,
                    };
                  });
                  // Update message with citations immediately
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
                      updated[lastIdx] = {
                        ...updated[lastIdx],
                        citations,
                      };
                    }
                    return updated;
                  });
                }
              } catch (e) {
                // Ignore parse errors for data chunks
                console.error(e);
              }
            }
          }
        }

        // Update final message with citations
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
            const finalMessage = {
              ...updated[lastIdx],
              content: fullContent,
              parts: [{ type: "text", text: fullContent }],
              citations,
            };
            onFinish?.(finalMessage);
            updated[lastIdx] = finalMessage;
          }
          return updated;
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was aborted, don't treat as error
          return;
        }
        const error = err instanceof Error ? err : new Error("Unknown error");
        setError(error);
        onError?.(error);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [endpoint, messages, repositoryId, isLoading, onFinish, onError, githubUrl, defaultBranch]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      handleSendMessage(input);
    },
    [handleSendMessage, input]
  );

  return {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    handleSendMessage,
    stop,
    isLoading,
    status: isLoading ? "streaming" : "ready",
    error,
    getMessageContent,
    setMessages,
  };
}

export const useChat = useNexuChat;
