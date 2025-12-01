import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface FunctionComplexity {
  name: string;
  line: number;
  complexity: number;
  loc: number; // lines of code
}

interface ComplexityHeatmapProps {
  code: string;
  className?: string;
}

// Calculate cyclomatic complexity for code
function calculateComplexity(code: string): FunctionComplexity[] {
  const functions: FunctionComplexity[] = [];
  const lines = code.split("\n");
  
  let currentFunc: { name: string; line: number; startLine: number } | null = null;
  let braceCount = 0;
  let funcComplexity = 1; // Base complexity
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Function declaration
    const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)|^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/);
    const methodMatch = trimmed.match(/^(async\s+)?(\w+)\s*\([^)]*\)\s*{/);
    
    if ((funcMatch || methodMatch) && !currentFunc) {
      const funcName = funcMatch ? (funcMatch[3] || funcMatch[6]) : methodMatch?.[2];
      if (funcName && !["if", "for", "while", "switch"].includes(funcName)) {
        currentFunc = {
          name: funcName,
          line: index + 1,
          startLine: index,
        };
        funcComplexity = 1;
        braceCount = 0;
      }
    }
    
    if (currentFunc) {
      // Count complexity indicators
      if (/\bif\s*\(/.test(trimmed)) funcComplexity++;
      if (/\belse\s+if\s*\(/.test(trimmed)) funcComplexity++;
      if (/\bfor\s*\(/.test(trimmed)) funcComplexity++;
      if (/\bwhile\s*\(/.test(trimmed)) funcComplexity++;
      if (/\bswitch\s*\(/.test(trimmed)) funcComplexity++;
      if (/\bcase\s+/.test(trimmed)) funcComplexity++;
      if (/\bcatch\s*\(/.test(trimmed)) funcComplexity++;
      if (/\?\s*[^:]+\s*:/.test(trimmed)) funcComplexity++; // ternary
      if (/&&|\|\|/.test(trimmed)) funcComplexity++; // logical operators
      
      // Track braces
      braceCount += (trimmed.match(/{/g) || []).length;
      braceCount -= (trimmed.match(/}/g) || []).length;
      
      // End of function
      if (braceCount <= 0 && trimmed.includes("}")) {
        functions.push({
          name: currentFunc.name,
          line: currentFunc.line,
          complexity: funcComplexity,
          loc: index - currentFunc.startLine + 1,
        });
        currentFunc = null;
        funcComplexity = 1;
      }
    }
  });
  
  return functions.sort((a, b) => b.complexity - a.complexity);
}

function getComplexityColor(complexity: number): string {
  if (complexity <= 3) return "bg-emerald-500/20 border-emerald-500/40";
  if (complexity <= 6) return "bg-yellow-500/20 border-yellow-500/40";
  if (complexity <= 10) return "bg-orange-500/20 border-orange-500/40";
  return "bg-red-500/20 border-red-500/40";
}

function getComplexityLabel(complexity: number): string {
  if (complexity <= 3) return "Simple";
  if (complexity <= 6) return "Moderate";
  if (complexity <= 10) return "Complex";
  return "Very Complex";
}

function getComplexityTextColor(complexity: number): string {
  if (complexity <= 3) return "text-emerald-400";
  if (complexity <= 6) return "text-yellow-400";
  if (complexity <= 10) return "text-orange-400";
  return "text-red-400";
}

export function ComplexityHeatmap({ code, className }: ComplexityHeatmapProps) {
  const functions = useMemo(() => calculateComplexity(code), [code]);
  
  if (functions.length === 0) {
    return (
      <div className={cn("text-muted-foreground text-sm p-4", className)}>
        No functions detected for complexity analysis.
      </div>
    );
  }
  
  const avgComplexity = functions.reduce((sum, f) => sum + f.complexity, 0) / functions.length;
  const maxComplexity = Math.max(...functions.map(f => f.complexity));
  
  return (
    <div className={cn("border border-border rounded-lg p-4 bg-muted/20", className)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        Cyclomatic Complexity
      </div>
      
      {/* Summary */}
      <div className="flex gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Functions:</span>
          <span className="font-medium">{functions.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Avg:</span>
          <span className={cn("font-medium", getComplexityTextColor(avgComplexity))}>
            {avgComplexity.toFixed(1)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Max:</span>
          <span className={cn("font-medium", getComplexityTextColor(maxComplexity))}>
            {maxComplexity}
          </span>
        </div>
      </div>
      
      {/* Heatmap bars */}
      <div className="space-y-1.5">
        {functions.map((func, i) => (
          <div key={i} className="flex items-center gap-2">
            <div 
              className={cn(
                "flex-1 flex items-center justify-between px-2 py-1 rounded border text-xs font-mono",
                getComplexityColor(func.complexity)
              )}
            >
              <span className="truncate">{func.name}</span>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground">{func.loc} LOC</span>
                <span className="text-muted-foreground">L{func.line}</span>
              </div>
            </div>
            <div className={cn("w-16 text-right text-xs font-medium", getComplexityTextColor(func.complexity))}>
              {func.complexity} · {getComplexityLabel(func.complexity)}
            </div>
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex gap-3 mt-4 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1 text-[10px]">
          <div className="w-2 h-2 rounded-sm bg-emerald-500/40" />
          <span className="text-muted-foreground">1-3</span>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          <div className="w-2 h-2 rounded-sm bg-yellow-500/40" />
          <span className="text-muted-foreground">4-6</span>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          <div className="w-2 h-2 rounded-sm bg-orange-500/40" />
          <span className="text-muted-foreground">7-10</span>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          <div className="w-2 h-2 rounded-sm bg-red-500/40" />
          <span className="text-muted-foreground">10+</span>
        </div>
      </div>
    </div>
  );
}
