import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Settings, Network, ArrowLeft, Square } from "lucide-react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { IndexStatus } from "@/components/IndexStatus";
import { CodeGraph } from "@/components/CodeGraph";
import { CodeThemeSelector } from "@/components/CodeThemeSelector";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { ScrollToBottom } from "@/components/ScrollToBottom";
import { EmptyState } from "@/components/EmptyState";
import { useNexuChat, getMessageContent } from "@/hooks/use-chat";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getRepositories } from "@/lib/api";

type ViewMode = "chat" | "graph";

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
  const { codebaseId } = useParams();
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Fetch repository data
  const { data: repoData } = useQuery({
    queryKey: ["repositories"],
    queryFn: getRepositories,
  });

  // Find the current repository from the list
  const currentRepo = repoData?.repositories.find((r) => r.id === codebaseId);

  const {
    messages,
    isLoading,
    stop,
    handleSendMessage: originalSendMessage,
  } = useNexuChat({
    repositoryId: codebaseId,
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
    scrollToBottom();
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
      // Toggle graph view
      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        e.preventDefault();
        setViewMode((prev) => (prev === "chat" ? "graph" : "chat"));
      }
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

  const handleNodeClick = (node: any) => {
    toast({
      title: node.name,
      description: `${node.type} • Click to explore in chat`,
    });

    setViewMode("chat");
    handleSendMessage(`Tell me about ${node.name}`);
  };

  // Get last user message for retry
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  
  const handleRetry = useCallback(() => {
    if (lastUserMessage) {
      const content = getMessageContent(lastUserMessage);
      handleSendMessage(content);
    }
  }, [lastUserMessage, handleSendMessage]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <Link to="/">
            <button className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-base font-semibold text-foreground">nexu</h1>
            <p className="text-xs text-muted-foreground">{codebaseId}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isLoading && (
            <button
              onClick={stop}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            >
              <Square className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          )}
          <button
            onClick={() => setViewMode(viewMode === "chat" ? "graph" : "chat")}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
              viewMode === "graph"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Network className="w-4 h-4" />
            <span className="hidden sm:inline">Graph</span>
          </button>
          <button className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          <CodeThemeSelector />
        </div>
      </header>

      {/* Index Status */}
      {currentRepo && (
        <IndexStatus
          repository={currentRepo.fullName}
          chunks={currentRepo.chunkCount}
          lastUpdate={formatTimeAgo(currentRepo.indexedAt)}
          onReindex={() => console.log("Re-indexing...")}
        />
      )}

      {/* Main Content */}
      {viewMode === "graph" ? (
        <div className="flex-1 overflow-hidden">
          <CodeGraph onNodeClick={handleNodeClick} codebaseId={codebaseId} />
        </div>
      ) : (
        <>
          {/* Messages */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto relative"
          >
            {/* Empty state with example questions */}
            {messages.length === 0 && (
              <EmptyState onSelectExample={handleSendMessage} />
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
            placeholder={`Ask about ${codebaseId}...`}
            autoFocus={true}
            onShowShortcuts={() => setShowShortcuts(true)}
          />
        </>
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
      />
    </div>
  );
};

export default Chat;
