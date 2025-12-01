import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight, Box, Circle } from "lucide-react";

interface TypeNode {
  name: string;
  kind: "interface" | "type" | "function" | "variable" | "parameter";
  type: string;
  flows?: string[];
}

interface TypeFlowProps {
  code: string;
  className?: string;
}

// Parse TypeScript types from code
function parseTypeFlow(code: string): TypeNode[] {
  const nodes: TypeNode[] = [];
  const lines = code.split("\n");
  
  lines.forEach((line) => {
    const trimmed = line.trim();
    
    // Interface declarations
    const interfaceMatch = trimmed.match(/^(export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      nodes.push({
        name: interfaceMatch[2],
        kind: "interface",
        type: "interface",
        flows: [],
      });
      return;
    }
    
    // Type aliases
    const typeMatch = trimmed.match(/^(export\s+)?type\s+(\w+)\s*=\s*(.+)/);
    if (typeMatch) {
      const typeValue = typeMatch[3].replace(/;$/, "").trim();
      nodes.push({
        name: typeMatch[2],
        kind: "type",
        type: typeValue.slice(0, 30) + (typeValue.length > 30 ? "…" : ""),
        flows: [],
      });
      return;
    }
    
    // Function with typed parameters
    const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*:\s*(\w+)/);
    if (funcMatch) {
      const funcName = funcMatch[3];
      const params = funcMatch[4];
      const returnType = funcMatch[5];
      
      // Extract parameter types
      const paramTypes = params.split(",").map(p => {
        const match = p.match(/(\w+)\s*:\s*(\w+)/);
        return match ? match[2] : null;
      }).filter(Boolean);
      
      nodes.push({
        name: funcName,
        kind: "function",
        type: `(${paramTypes.join(", ")}) → ${returnType}`,
        flows: [...paramTypes as string[], returnType],
      });
      return;
    }
    
    // Arrow function with types
    const arrowMatch = trimmed.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*:\s*\(([^)]*)\)\s*=>\s*(\w+)/);
    if (arrowMatch) {
      const funcName = arrowMatch[3];
      const returnType = arrowMatch[5];
      
      nodes.push({
        name: funcName,
        kind: "function",
        type: `() → ${returnType}`,
        flows: [returnType],
      });
      return;
    }
    
    // Typed variable declarations
    const varMatch = trimmed.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*:\s*(\w+[\w<>,\s]*)/);
    if (varMatch && !trimmed.includes("=>") && !trimmed.includes("function")) {
      nodes.push({
        name: varMatch[3],
        kind: "variable",
        type: varMatch[4].trim(),
        flows: [varMatch[4].trim()],
      });
      return;
    }
  });
  
  return nodes;
}

function getKindColor(kind: string): string {
  switch (kind) {
    case "interface":
      return "border-purple-500/50 bg-purple-500/10 text-purple-400";
    case "type":
      return "border-blue-500/50 bg-blue-500/10 text-blue-400";
    case "function":
      return "border-green-500/50 bg-green-500/10 text-green-400";
    case "variable":
      return "border-yellow-500/50 bg-yellow-500/10 text-yellow-400";
    default:
      return "border-muted bg-muted/50 text-muted-foreground";
  }
}

function getKindIcon(kind: string) {
  switch (kind) {
    case "interface":
    case "type":
      return <Box className="w-3 h-3" />;
    default:
      return <Circle className="w-2 h-2 fill-current" />;
  }
}

export function TypeFlow({ code, className }: TypeFlowProps) {
  const typeNodes = useMemo(() => parseTypeFlow(code), [code]);
  
  if (typeNodes.length === 0) {
    return (
      <div className={cn("text-muted-foreground text-sm p-4", className)}>
        No TypeScript types detected in this code snippet.
      </div>
    );
  }
  
  // Group by kind
  const interfaces = typeNodes.filter(n => n.kind === "interface" || n.kind === "type");
  const functions = typeNodes.filter(n => n.kind === "function");
  const variables = typeNodes.filter(n => n.kind === "variable");
  
  return (
    <div className={cn("border border-border rounded-lg p-4 bg-muted/20", className)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        Type Flow
      </div>
      
      <div className="space-y-4">
        {/* Types/Interfaces */}
        {interfaces.length > 0 && (
          <div>
            <div className="text-[10px] text-muted-foreground mb-2">Types & Interfaces</div>
            <div className="flex flex-wrap gap-2">
              {interfaces.map((node, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono",
                    getKindColor(node.kind)
                  )}
                >
                  {getKindIcon(node.kind)}
                  <span className="font-medium">{node.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Functions with type flow */}
        {functions.length > 0 && (
          <div>
            <div className="text-[10px] text-muted-foreground mb-2">Function Type Flow</div>
            <div className="space-y-2">
              {functions.map((node, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono",
                      getKindColor(node.kind)
                    )}
                  >
                    {getKindIcon(node.kind)}
                    <span className="font-medium">{node.name}</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <div className="text-xs font-mono text-muted-foreground">
                    {node.type}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Variables with types */}
        {variables.length > 0 && (
          <div>
            <div className="text-[10px] text-muted-foreground mb-2">Typed Variables</div>
            <div className="flex flex-wrap gap-2">
              {variables.map((node, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono",
                      getKindColor(node.kind)
                    )}
                  >
                    <span className="font-medium">{node.name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">:</span>
                  <span className="text-xs font-mono text-muted-foreground">{node.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1.5 text-[10px]">
          <div className="w-2 h-2 rounded-sm bg-purple-500/40" />
          <span className="text-muted-foreground">Interface/Type</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <div className="w-2 h-2 rounded-sm bg-green-500/40" />
          <span className="text-muted-foreground">Function</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <div className="w-2 h-2 rounded-sm bg-yellow-500/40" />
          <span className="text-muted-foreground">Variable</span>
        </div>
      </div>
    </div>
  );
}
