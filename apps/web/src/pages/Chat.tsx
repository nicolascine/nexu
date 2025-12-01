import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";
import { CodeThemeSelector } from "@/components/CodeThemeSelector";
import { EmptyState } from "@/components/EmptyState";
import { IndexStatus } from "@/components/IndexStatus";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { ScrollToBottom } from "@/components/ScrollToBottom";
import { getMessageContent, useNexuChat } from "@/hooks/use-chat";
import { useToast } from "@/hooks/use-toast";
import { getRepositories, parseRepoSlug } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return "just now";
}

const Chat = () => {
  const { codebaseId: slug } = useParams();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Parse slug to get owner/name
  const slugParts = slug ? parseRepoSlug(slug) : null;

  // Fetch repository data
  const { data: repoData } = useQuery({
    queryKey: ["repositories"],
    queryFn: getRepositories,
  });

  // Find the current repository from the list by slug (owner--name)
  const currentRepo = repoData?.repositories.find((r) =>
    slugParts && r.owner.toLowerCase() === slugParts.owner && r.name.toLowerCase() === slugParts.name
  );

  const {
    messages,
    isLoading,
    stop,
    handleSendMessage: originalSendMessage,
  } = useNexuChat({
    repositoryId: currentRepo?.id,
    githubUrl: currentRepo?.url,
    defaultBranch: currentRepo?.defaultBranch,
    onError: (err) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
    onFinish: (message) => {
      console.log("Message finished:", message.id);
    },
  });

  const handleSendMessage = useCallback((content: string) => {
    originalSendMessage(content);
  }, [originalSendMessage]);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: smooth ? "smooth" : "auto" 
    });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    // Only scroll if we were already near the bottom or if it's a new message
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 100;
    
    // Trigger dependency on messages length
    const _ = messages.length;

    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  // Track scroll position for scroll-to-bottom button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setShowScrollButton(distanceFromBottom > 200);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Show shortcuts modal
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        const activeElement = document.activeElement;
        const isInputFocused =
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement;

        if (!isInputFocused) {
          e.preventDefault();
          setShowShortcuts((prev) => !prev);
        }
      }
      // Close modal on Escape
      if (e.key === "Escape" && showShortcuts) {
        setShowShortcuts(false);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [showShortcuts]);

  // Get last user message for retry
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  
  const handleRetry = useCallback(() => {
    if (lastUserMessage) {
      const content = getMessageContent(lastUserMessage);
      handleSendMessage(content);
    }
  }, [lastUserMessage, handleSendMessage]);

  return (
    <div className="flex flex-col bg-background h-screen">
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-2 border-border border-b">
        <div className="flex items-center gap-3">
          <Link to="/">
            <button type="button" className="hover:bg-muted p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="font-semibold text-foreground text-base">nexu</h1>
            <p className="text-muted-foreground text-xs">{currentRepo?.fullName || slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isLoading && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-2 hover:bg-destructive/10 px-3 py-1.5 rounded-md text-destructive text-sm transition-colors"
            >
              <Square className="fill-current w-3 h-3" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          )}
          <CodeThemeSelector />
        </div>
      </header>

      {/* Index Status */}
      {currentRepo && (
        <IndexStatus
          repository={currentRepo.fullName}
          chunks={currentRepo.chunkCount}
          lastUpdate={formatTimeAgo(currentRepo.indexedAt)}
        />
      )}

      {/* Main Content */}
      <>
        {/* Messages */}
        <div 
          ref={messagesContainerRef}
          className="relative flex-1 overflow-y-auto"
        >
            {/* Empty state with example questions */}
            {messages.length === 0 && (
              <EmptyState onSelectExample={handleSendMessage} repositoryId={currentRepo?.id} />
            )}
            
            {messages.length > 0 && (
              <>
                {messages
                  .filter((m) => m.role !== "system")
                  .map((message, index, filteredMessages) => {
                    const isLastAssistant =
                      message.role === "assistant" &&
                      index === filteredMessages.length - 1;
                    
                    const content = getMessageContent(message);
                    
                    return (
                      <ChatMessage
                        key={message.id}
                        role={message.role as "user" | "assistant"}
                        content={content}
                        citations={message.citations}
                        timestamp={new Date().toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        isStreaming={isLastAssistant && isLoading}
                        onRetry={isLastAssistant ? handleRetry : undefined}
                      />
                    );
                  })}
                <div ref={messagesEndRef} />
              </>
            )}
            
            {/* Scroll to bottom button */}
            <ScrollToBottom 
              visible={showScrollButton && messages.length > 0}
              onClick={() => scrollToBottom()}
            />
          </div>

          {/* Input */}
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={isLoading}
            placeholder={`Ask about ${currentRepo?.name || 'this codebase'}...`}
            autoFocus={true}
            onShowShortcuts={() => setShowShortcuts(true)}
          />
        </>
      )

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
      />
    </div>
  );
};

export default Chat;
