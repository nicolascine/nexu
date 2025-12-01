import { useState } from "react";
import { ExternalLink, Copy, ChevronDown, ChevronUp, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CodeBlock } from "./CodeBlock";

export interface Citation {
  id: string;
  file: string;
  lines: string;
  code: string;
  url: string;
}

interface CitationCardProps {
  citation: Citation;
  index: number;
}

export function CitationCard({ citation, index }: CitationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  const codeLines = citation.code.split("\n");
  const previewLines = codeLines.slice(0, 5);
  const hasMore = codeLines.length > 5;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(citation.file);
    toast({
      description: "Path copied to clipboard",
      duration: 2000,
    });
  };

  return (
    <div className={cn(
      "rounded-md border border-border bg-background",
      "hover:bg-surface active:bg-surface transition-colors"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-3 py-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <FileCode className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs sm:text-sm font-mono text-foreground truncate">
            {citation.file}
          </span>
          <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">
            L{citation.lines}
          </span>
        </div>
        <span className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded text-muted-foreground ml-2">
          {index}
        </span>
      </div>

      {/* Code Preview */}
      <div className="px-2 sm:px-3 pb-2 -mt-1 overflow-x-auto">
        <CodeBlock
          code={(isExpanded ? codeLines : previewLines).join("\n")}
          language={citation.file.split('.').pop() || "typescript"}
          showLineNumbers={false}
        />
        {hasMore && !isExpanded && (
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
            +{codeLines.length - 5} more lines
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 border-t border-border">
        <button
          onClick={() => window.open(citation.url, "_blank")}
          className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted rounded transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          <span className="hidden xs:inline">GitHub</span>
        </button>
        <button
          onClick={handleCopyPath}
          className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted rounded transition-colors"
        >
          <Copy className="w-3 h-3" />
          <span className="hidden xs:inline">Copy</span>
        </button>
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted rounded transition-colors ml-auto"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span className="hidden xs:inline">Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span className="hidden xs:inline">More</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}