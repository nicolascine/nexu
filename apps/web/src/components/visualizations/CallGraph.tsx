import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowDown, Circle } from "lucide-react";

interface CallNode {
  name: string;
  line?: number;
  calls: string[];
}

interface CallGraphProps {
  code: string;
  className?: string;
}

// Parse function calls from code
function parseCallGraph(code: string): CallNode[] {
  const nodes: CallNode[] = [];
  const lines = code.split("\n");
  
  let currentFunction: CallNode | null = null;
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Function declaration
    const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)|^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?(\([^)]*\)|[^=]+)\s*=>/);
    if (funcMatch) {
      const funcName = funcMatch[3] || funcMatch[6] || "anonymous";
      currentFunction = {
        name: funcName,
        line: index + 1,
        calls: [],
      };
      nodes.push(currentFunction);
    }
    
    // Method in class
    const methodMatch = trimmed.match(/^(async\s+)?(\w+)\s*\([^)]*\)\s*{/);
    if (methodMatch && !funcMatch) {
      currentFunction = {
        name: methodMatch[2],
        line: index + 1,
        calls: [],
      };
      nodes.push(currentFunction);
    }
    
    // Find function calls within current function
    if (currentFunction) {
      // Match function calls like: functionName(), await functionName(), this.method()
      const callMatches = trimmed.matchAll(/(?:await\s+)?(?:this\.)?(\w+)\s*\(/g);
      for (const match of callMatches) {
        const callName = match[1];
        // Exclude common keywords and the function's own name
        if (!["if", "for", "while", "switch", "catch", "function", "async", currentFunction.name].includes(callName)) {
          if (!currentFunction.calls.includes(callName)) {
            currentFunction.calls.push(callName);
          }
        }
      }
    }
    
    // End of function
    if (trimmed === "}" && currentFunction) {
      currentFunction = null;
    }
  });
  
  return nodes.filter(n => n.calls.length > 0);
}

function CallNodeComponent({ node }: { node: CallNode }) {
  return (
    <div className="flex flex-col items-center">
      {/* Function node */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-foreground/30 bg-foreground/5">
        <Circle className="w-2 h-2 fill-blue-400 text-blue-400" />
        <span className="text-xs font-mono font-medium">{node.name}</span>
        {node.line && (
          <span className="text-[10px] text-muted-foreground">L{node.line}</span>
        )}
      </div>
      
      {/* Calls */}
      {node.calls.length > 0 && (
        <>
          <ArrowDown className="w-3 h-3 text-muted-foreground my-1" />
          <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
            {node.calls.map((call, i) => (
              <div 
                key={i}
                className="px-2 py-0.5 rounded text-[11px] font-mono border border-muted bg-muted/50"
              >
                {call}()
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CallGraph({ code, className }: CallGraphProps) {
  const callNodes = useMemo(() => parseCallGraph(code), [code]);
  
  if (callNodes.length === 0) {
    return (
      <div className={cn("text-muted-foreground text-sm p-4", className)}>
        No function calls detected in this code snippet.
      </div>
    );
  }
  
  return (
    <div className={cn("border border-border rounded-lg p-4 bg-muted/20", className)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        Call Graph
      </div>
      
      <div className="flex flex-wrap gap-6 justify-center">
        {callNodes.map((node, i) => (
          <CallNodeComponent key={i} node={node} />
        ))}
      </div>
    </div>
  );
}
