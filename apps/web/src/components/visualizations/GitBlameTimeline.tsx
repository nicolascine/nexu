import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { User, Calendar } from "lucide-react";

interface BlameEntry {
  author: string;
  date: Date;
  lines: number;
  commit: string;
  message: string;
}

interface GitBlameTimelineProps {
  filePath?: string;
  className?: string;
}

// Generate mock blame data based on file path
function generateMockBlame(filePath: string): BlameEntry[] {
  const authors = [
    { name: "alex.chen", color: "bg-blue-500" },
    { name: "sarah.dev", color: "bg-purple-500" },
    { name: "mike.wilson", color: "bg-green-500" },
    { name: "emma.code", color: "bg-orange-500" },
  ];
  
  const messages = [
    "refactor: improve error handling",
    "feat: add validation logic",
    "fix: handle edge case for null",
    "chore: update dependencies",
    "perf: optimize query performance",
    "docs: update inline comments",
  ];
  
  // Generate pseudo-random but consistent data based on file path
  const seed = filePath.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const numEntries = 3 + (seed % 4);
  
  const entries: BlameEntry[] = [];
  const now = new Date();
  
  for (let i = 0; i < numEntries; i++) {
    const authorIndex = (seed + i) % authors.length;
    const messageIndex = (seed + i * 2) % messages.length;
    const daysAgo = (seed + i * 7) % 90;
    const lines = 5 + ((seed + i * 3) % 30);
    
    entries.push({
      author: authors[authorIndex].name,
      date: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
      lines,
      commit: `${(seed + i).toString(16).slice(0, 7)}`,
      message: messages[messageIndex],
    });
  }
  
  return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function getAuthorColor(author: string): string {
  const colors = [
    "bg-blue-500",
    "bg-purple-500", 
    "bg-green-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
  ];
  const index = author.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

function formatDate(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

export function GitBlameTimeline({ filePath = "current file", className }: GitBlameTimelineProps) {
  const blameEntries = useMemo(() => generateMockBlame(filePath), [filePath]);
  
  const totalLines = blameEntries.reduce((sum, e) => sum + e.lines, 0);
  const uniqueAuthors = [...new Set(blameEntries.map(e => e.author))];
  
  return (
    <div className={cn("border border-border rounded-lg p-4 bg-muted/20", className)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        Git Blame Timeline
      </div>
      
      {/* Summary */}
      <div className="flex gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Contributors:</span>
          <span className="font-medium">{uniqueAuthors.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Last change:</span>
          <span className="font-medium">{formatDate(blameEntries[0]?.date)}</span>
        </div>
      </div>
      
      {/* Timeline bar */}
      <div className="flex h-6 rounded overflow-hidden mb-4">
        {blameEntries.map((entry, i) => (
          <div
            key={i}
            className={cn("h-full", getAuthorColor(entry.author))}
            style={{ width: `${(entry.lines / totalLines) * 100}%` }}
            title={`${entry.author}: ${entry.lines} lines`}
          />
        ))}
      </div>
      
      {/* Entries */}
      <div className="space-y-2">
        {blameEntries.map((entry, i) => (
          <div key={i} className="flex items-start gap-3 text-xs">
            <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", getAuthorColor(entry.author))} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{entry.author}</span>
                <span className="text-muted-foreground text-[10px]">{formatDate(entry.date)}</span>
              </div>
              <div className="text-muted-foreground truncate">{entry.message}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-mono text-[10px] text-muted-foreground">{entry.commit}</div>
              <div className="text-[10px] text-muted-foreground">{entry.lines} lines</div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border/50">
        {uniqueAuthors.map((author) => (
          <div key={author} className="flex items-center gap-1.5 text-[10px]">
            <div className={cn("w-2 h-2 rounded-full", getAuthorColor(author))} />
            <span className="text-muted-foreground">{author}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
