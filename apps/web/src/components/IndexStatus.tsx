import { cn } from "@/lib/utils";
import { Circle } from "lucide-react";

interface IndexStatusProps {
  repository: string;
  chunks: number;
  lastUpdate: string;
}

export function IndexStatus({ 
  repository, 
  chunks, 
  lastUpdate,
}: IndexStatusProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface/50 px-3 sm:px-4 py-2 border-border border-b text-[10px] sm:text-xs">
      <div className="flex items-center gap-2">
        <Circle 
          className={cn(
            "flex-shrink-0 fill-current w-2 h-2 text-success"
          )} 
        />
        <span className="max-w-[120px] sm:max-w-none font-medium truncate">{repository}</span>
        <span className="hidden sm:inline text-muted-foreground">indexed</span>
      </div>
      
      <div className="hidden sm:block bg-border w-px h-3" />
      
      <span className="text-muted-foreground">
        {chunks.toLocaleString()} chunks
      </span>
      
      <div className="hidden sm:block bg-border w-px h-3" />
      
      <span className="hidden sm:inline text-muted-foreground">
        Last update: {lastUpdate}
      </span>
    </div>
  );
}
