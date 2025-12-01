import { Circle, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface IndexStatusProps {
  repository: string;
  chunks: number;
  lastUpdate: string;
  isIndexing?: boolean;
  onReindex?: () => void;
}

export function IndexStatus({ 
  repository, 
  chunks, 
  lastUpdate,
  isIndexing = false,
  onReindex
}: IndexStatusProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 sm:px-4 py-2 text-[10px] sm:text-xs border-b border-border bg-surface/50">
      <div className="flex items-center gap-2">
        <Circle 
          className={cn(
            "w-2 h-2 fill-current flex-shrink-0",
            isIndexing ? "text-warning animate-pulse" : "text-success"
          )} 
        />
        <span className="font-medium truncate max-w-[120px] sm:max-w-none">{repository}</span>
        <span className="hidden sm:inline text-muted-foreground">indexed</span>
      </div>
      
      <div className="hidden sm:block h-3 w-px bg-border" />
      
      <span className="text-muted-foreground">
        {chunks.toLocaleString()} chunks
      </span>
      
      <div className="hidden sm:block h-3 w-px bg-border" />
      
      <span className="hidden sm:inline text-muted-foreground">
        Last update: {lastUpdate}
      </span>

      {onReindex && (
        <>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-2"
            onClick={onReindex}
            disabled={isIndexing}
          >
            <RefreshCw className={cn("w-3 h-3", isIndexing && "animate-spin")} />
            <span className="hidden sm:inline">Re-index</span>
          </Button>
        </>
      )}
    </div>
  );
}
