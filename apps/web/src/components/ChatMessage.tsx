import { useState } from "react";
import { Copy, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { CitationCard } from "./CitationCard";
import { renderMarkdownContent, renderDiagramOnly, extractAllCode } from "@/lib/markdown";
import { useToast } from "@/hooks/use-toast";
import { ResponseTabs } from "./ResponseTabs";
import { ASTExplorer } from "./visualizations/ASTExplorer";
import { DependencyGraph } from "./visualizations/DependencyGraph";
import { CallGraph } from "./visualizations/CallGraph";
import { ComplexityHeatmap } from "./visualizations/ComplexityHeatmap";
import { GitBlameTimeline } from "./visualizations/GitBlameTimeline";
import { TypeFlow } from "./visualizations/TypeFlow";

export interface Citation {
  id: string;
  file: string;
  lines: string;
  code: string;
  url: string;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp?: string;
  isStreaming?: boolean;
  onRetry?: () => void;
}

export function ChatMessage({ 
  role, 
  content, 
  citations, 
  timestamp,
  isStreaming,
  onRetry,
}: ChatMessageProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({
        title: "Copied",
        description: "Message copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy message",
        variant: "destructive",
      });
    }
  };

  // Combine all code from content and citations for visualizations
  const allCode = [
    extractAllCode(content),
    ...(citations?.map(c => c.code) || [])
  ].filter(Boolean).join("\n\n");

  // Get first citation file path for git blame
  const firstFilePath = citations?.[0]?.file || "current file";

  const renderContent = (activeTab: string) => {
    switch (activeTab) {
      case "diagram":
        return renderDiagramOnly(content);
      case "ast":
        return <ASTExplorer code={allCode} />;
      case "deps":
        return <DependencyGraph code={allCode} filePath={firstFilePath} />;
      case "calls":
        return <CallGraph code={allCode} />;
      case "complexity":
        return <ComplexityHeatmap code={allCode} />;
      case "blame":
        return <GitBlameTimeline filePath={firstFilePath} />;
      case "types":
        return <TypeFlow code={allCode} />;
      default:
        return renderMarkdownContent(content);
    }
  };

  return (
    <div className={cn(
      "group w-full py-3 px-3 sm:py-4 sm:px-4 animate-fade-in",
      isUser ? "bg-surface" : "bg-background"
    )}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Avatar */}
          <div className={cn(
            "flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-medium transition-transform group-hover:scale-105",
            isUser 
              ? "bg-muted text-muted-foreground" 
              : "bg-foreground text-background"
          )}>
            {isUser ? "Y" : "N"}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {isUser ? "You" : "Nexu"}
                </span>
                {timestamp && (
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    {timestamp}
                  </span>
                )}
              </div>
              
              {/* Actions - always visible on mobile, hover on desktop */}
              <div className={cn(
                "flex items-center gap-0.5 sm:gap-1",
                "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              )}>
                <button
                  onClick={handleCopy}
                  className={cn(
                    "p-1 sm:p-1.5 rounded-md text-muted-foreground",
                    "hover:bg-muted hover:text-foreground",
                    "active:bg-muted active:text-foreground",
                    "transition-colors"
                  )}
                  title="Copy message"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                
                {!isUser && onRetry && !isStreaming && (
                  <button
                    onClick={onRetry}
                    className={cn(
                      "p-1 sm:p-1.5 rounded-md text-muted-foreground",
                      "hover:bg-muted hover:text-foreground",
                      "active:bg-muted active:text-foreground",
                      "transition-colors"
                    )}
                    title="Retry"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            {isUser ? (
              <div className={cn(
                "prose prose-sm max-w-none",
                "prose-p:text-foreground prose-p:leading-relaxed prose-p:my-2",
                "text-[15px]"
              )}>
                {content}
              </div>
            ) : (
              <ResponseTabs content={content} citations={citations}>
                {(activeTab) => (
                  <div className={cn(
                    "prose prose-sm max-w-none",
                    "prose-p:text-foreground prose-p:leading-relaxed prose-p:my-2",
                    "prose-headings:text-foreground prose-headings:font-semibold",
                    "prose-strong:text-foreground prose-strong:font-semibold",
                    "prose-code:text-foreground prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm",
                    "prose-code:before:content-none prose-code:after:content-none",
                    "prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-0",
                    "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
                    "dark:prose-invert"
                  )}>
                    {renderContent(activeTab)}
                    {isStreaming && (
                      <span className="inline-block w-0.5 h-4 ml-0.5 bg-foreground animate-pulse" />
                    )}
                  </div>
                )}
              </ResponseTabs>
            )}

            {/* Citations */}
            {citations && citations.length > 0 && (
              <div className="space-y-2 mt-4 pt-2">
                {citations.map((citation, index) => (
                  <CitationCard
                    key={citation.id}
                    citation={citation}
                    index={index + 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
