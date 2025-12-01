import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Dependency {
  from: string;
  to: string;
  type: "import" | "export" | "extends" | "implements";
}

interface DependencyGraphProps {
  code: string;
  filePath?: string;
  className?: string;
}

// Parse imports from code
function parseImports(code: string): Dependency[] {
  const deps: Dependency[] = [];
  const lines = code.split("\n");
  
  lines.forEach((line) => {
    // ES6 imports
    const importMatch = line.match(/import\s+.*from\s+['"](.+)['"]/);
    if (importMatch) {
      deps.push({
        from: "current",
        to: importMatch[1],
        type: "import",
      });
    }
    
    // require statements
    const requireMatch = line.match(/require\(['"](.+)['"]\)/);
    if (requireMatch) {
      deps.push({
        from: "current",
        to: requireMatch[1],
        type: "import",
      });
    }
    
    // extends/implements
    const extendsMatch = line.match(/extends\s+(\w+)/);
    if (extendsMatch) {
      deps.push({
        from: "current",
        to: extendsMatch[1],
        type: "extends",
      });
    }
    
    const implementsMatch = line.match(/implements\s+([\w,\s]+)/);
    if (implementsMatch) {
      implementsMatch[1].split(",").forEach((impl) => {
        deps.push({
          from: "current",
          to: impl.trim(),
          type: "implements",
        });
      });
    }
  });
  
  return deps;
}

function getShortPath(path: string): string {
  // Get last part of path
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return "…/" + parts.slice(-2).join("/");
}

function DependencyNode({ 
  name, 
  type,
  isCenter 
}: { 
  name: string; 
  type: "import" | "export" | "extends" | "implements";
  isCenter?: boolean;
}) {
  const colors = {
    import: "border-blue-500/50 bg-blue-500/10",
    export: "border-green-500/50 bg-green-500/10",
    extends: "border-yellow-500/50 bg-yellow-500/10",
    implements: "border-purple-500/50 bg-purple-500/10",
  };
  
  return (
    <div 
      className={cn(
        "px-2 py-1 rounded border text-xs font-mono truncate max-w-[150px]",
        isCenter ? "border-foreground/50 bg-foreground/10" : colors[type]
      )}
      title={name}
    >
      {getShortPath(name)}
    </div>
  );
}

export function DependencyGraph({ code, filePath = "current file", className }: DependencyGraphProps) {
  const dependencies = useMemo(() => parseImports(code), [code]);
  
  if (dependencies.length === 0) {
    return (
      <div className={cn("text-muted-foreground text-sm p-4", className)}>
        No dependencies detected in this code snippet.
      </div>
    );
  }
  
  // Group by type
  const grouped = dependencies.reduce((acc, dep) => {
    if (!acc[dep.type]) acc[dep.type] = [];
    acc[dep.type].push(dep);
    return acc;
  }, {} as Record<string, Dependency[]>);
  
  return (
    <div className={cn("border border-border rounded-lg p-4 bg-muted/20", className)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        Dependencies
      </div>
      
      <div className="flex flex-col items-center gap-4">
        {/* Center node */}
        <DependencyNode name={filePath} type="import" isCenter />
        
        {/* Connection lines */}
        <div className="w-px h-4 bg-border" />
        
        {/* Grouped dependencies */}
        <div className="flex flex-wrap gap-3 justify-center">
          {Object.entries(grouped).map(([type, deps]) => (
            <div key={type} className="flex flex-col items-center gap-2">
              <div className="text-[10px] text-muted-foreground capitalize">
                {type}s ({deps.length})
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center max-w-sm">
                {deps.map((dep, i) => (
                  <DependencyNode 
                    key={i} 
                    name={dep.to} 
                    type={dep.type as "import" | "export" | "extends" | "implements"} 
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
