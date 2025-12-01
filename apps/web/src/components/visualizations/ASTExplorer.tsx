import { useState } from "react";
import { ChevronRight, ChevronDown, Code, Braces, Variable, FunctionSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface ASTNode {
  type: string;
  name?: string;
  children?: ASTNode[];
  line?: number;
}

interface ASTExplorerProps {
  code: string;
  language?: string;
  className?: string;
}

// Simple AST parser for demonstration - parses common code patterns
function parseToAST(code: string, language: string = "typescript"): ASTNode {
  const lines = code.split("\n");
  const root: ASTNode = { type: "Program", children: [] };
  
  let currentNode = root;
  const stack: ASTNode[] = [root];
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Function declarations
    const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)|^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/);
    if (funcMatch) {
      const funcName = funcMatch[3] || funcMatch[6] || "anonymous";
      const node: ASTNode = {
        type: "FunctionDeclaration",
        name: funcName,
        line: index + 1,
        children: [],
      };
      currentNode.children?.push(node);
      stack.push(node);
      currentNode = node;
      return;
    }
    
    // Class declarations
    const classMatch = trimmed.match(/^(export\s+)?class\s+(\w+)/);
    if (classMatch) {
      const node: ASTNode = {
        type: "ClassDeclaration",
        name: classMatch[2],
        line: index + 1,
        children: [],
      };
      currentNode.children?.push(node);
      stack.push(node);
      currentNode = node;
      return;
    }
    
    // Interface/Type declarations
    const interfaceMatch = trimmed.match(/^(export\s+)?(interface|type)\s+(\w+)/);
    if (interfaceMatch) {
      const node: ASTNode = {
        type: interfaceMatch[2] === "interface" ? "InterfaceDeclaration" : "TypeAlias",
        name: interfaceMatch[3],
        line: index + 1,
        children: [],
      };
      currentNode.children?.push(node);
      return;
    }
    
    // Variable declarations
    const varMatch = trimmed.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*[=:]/);
    if (varMatch && !trimmed.includes("=>") && !trimmed.includes("function")) {
      const node: ASTNode = {
        type: "VariableDeclaration",
        name: varMatch[3],
        line: index + 1,
      };
      currentNode.children?.push(node);
      return;
    }
    
    // Import statements
    const importMatch = trimmed.match(/^import\s+.*from\s+['"](.+)['"]/);
    if (importMatch) {
      const node: ASTNode = {
        type: "ImportDeclaration",
        name: importMatch[1],
        line: index + 1,
      };
      root.children?.push(node);
      return;
    }
    
    // Closing braces - pop stack
    if (trimmed === "}" && stack.length > 1) {
      stack.pop();
      currentNode = stack[stack.length - 1];
    }
  });
  
  return root;
}

function ASTNodeComponent({ 
  node, 
  depth = 0 
}: { 
  node: ASTNode; 
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  
  const getIcon = () => {
    switch (node.type) {
      case "FunctionDeclaration":
        return <FunctionSquare className="w-3.5 h-3.5 text-blue-400" />;
      case "ClassDeclaration":
        return <Braces className="w-3.5 h-3.5 text-yellow-400" />;
      case "InterfaceDeclaration":
      case "TypeAlias":
        return <Code className="w-3.5 h-3.5 text-purple-400" />;
      case "VariableDeclaration":
        return <Variable className="w-3.5 h-3.5 text-green-400" />;
      case "ImportDeclaration":
        return <Code className="w-3.5 h-3.5 text-muted-foreground" />;
      default:
        return <Braces className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };
  
  const getTypeColor = () => {
    switch (node.type) {
      case "FunctionDeclaration":
        return "text-blue-400";
      case "ClassDeclaration":
        return "text-yellow-400";
      case "InterfaceDeclaration":
      case "TypeAlias":
        return "text-purple-400";
      case "VariableDeclaration":
        return "text-green-400";
      default:
        return "text-muted-foreground";
    }
  };
  
  return (
    <div className="select-none">
      <div 
        className={cn(
          "flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-muted/50 cursor-pointer group",
          "text-xs font-mono"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )
        ) : (
          <span className="w-3" />
        )}
        {getIcon()}
        <span className={cn("text-[11px]", getTypeColor())}>{node.type}</span>
        {node.name && (
          <span className="text-foreground font-medium">{node.name}</span>
        )}
        {node.line && (
          <span className="text-muted-foreground/60 text-[10px] ml-auto opacity-0 group-hover:opacity-100">
            L{node.line}
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children?.map((child, index) => (
            <ASTNodeComponent key={index} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ASTExplorer({ code, language = "typescript", className }: ASTExplorerProps) {
  const ast = parseToAST(code, language);
  
  if (!ast.children || ast.children.length === 0) {
    return (
      <div className={cn("text-muted-foreground text-sm p-4", className)}>
        No AST nodes detected in this code snippet.
      </div>
    );
  }
  
  return (
    <div className={cn("border border-border rounded-lg p-2 bg-muted/20", className)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 px-1">
        Abstract Syntax Tree
      </div>
      <div className="max-h-64 overflow-y-auto">
        <ASTNodeComponent node={ast} />
      </div>
    </div>
  );
}
