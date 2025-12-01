import { useToast } from "@/hooks/use-toast";
import { extractAllCode, renderDiagramOnly, renderMarkdownContent } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { Check, Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import { CitationCard } from "./CitationCard";
import { ResponseTabs } from "./ResponseTabs";
import { ASTExplorer } from "./visualizations/ASTExplorer";
import { CallGraph } from "./visualizations/CallGraph";
import { ComplexityHeatmap } from "./visualizations/ComplexityHeatmap";
import { DependencyGraph } from "./visualizations/DependencyGraph";
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
      "group px-3 sm:px-4 py-3 sm:py-4 w-full animate-fade-in",
      isUser ? "bg-surface dark:bg-[#2b313a]" : "bg-background"
    )}>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Avatar */}
          <div className={cn(
            "flex flex-shrink-0 justify-center items-center rounded-full w-6 sm:w-7 h-6 sm:h-7 font-medium text-[10px] sm:text-xs group-hover:scale-105 transition-transform",
            isUser 
              ? "bg-muted text-muted-foreground" 
              : "bg-foreground text-background"
          )}>
            {isUser ? "Y" : "N"}
          </div>

          <div className="flex-1 space-y-1 min-w-0">
            {/* Header */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground text-sm">
                  {isUser ? "You" : "Nexu"}
                </span>
                {timestamp && (
                  <span className="text-[10px] text-muted-foreground sm:text-xs">
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
                  type="button"
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
                    type="button"
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
                "max-w-none prose prose-sm",
                "prose-p:leading-6 prose-p:my-2",
                "text-sm"
              )}>
                {content}
              </div>
            ) : (
              <ResponseTabs content={content} citations={citations}>
                {(activeTab) => (
                  <div className={cn(
                    "max-w-none prose prose-sm",
                    "prose-p:leading-7 prose-p:my-3",
                    "prose-headings:font-medium prose-headings:my-3",
                    "prose-strong:font-medium",
                    "prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:font-normal",
                    "prose-code:before:content-none prose-code:after:content-none",
                    "prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-3",
                    "prose-ul:my-4 prose-ol:my-4 prose-li:my-2 prose-li:leading-7",
                    "prose-ul:list-disc prose-ol:list-decimal" // Ensure markers are visible
                  )}>
                    {renderContent(activeTab)}
                    {isStreaming && (
                      <span className="inline-block bg-foreground ml-0.5 w-0.5 h-4 animate-pulse" />
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
