import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useCodeTheme } from "@/hooks/use-code-theme";
import { cn } from "@/lib/utils";
import { Copy, Check, Maximize2, Minimize2 } from "lucide-react";

interface MermaidDiagramProps {
  code: string;
  className?: string;
}

export function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rendered, setRendered] = useState(false);
  const { themeInfo } = useCodeTheme();

  useEffect(() => {
    const render = async () => {
      if (!containerRef.current) return;
      
      setRendered(false);
      setError("");
      
      // Configure mermaid
      mermaid.initialize({
        startOnLoad: false,
        theme: themeInfo.isDark ? "dark" : "default",
        securityLevel: "loose",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        flowchart: {
          htmlLabels: true,
          curve: "basis",
        },
      });
      
      try {
        // Clear and set content
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        containerRef.current.innerHTML = `<pre class="mermaid" id="${id}">${code.trim()}</pre>`;
        
        // Run mermaid on the element
        await mermaid.run({
          nodes: [containerRef.current.querySelector(".mermaid")!],
        });
        
        // Style the generated SVG
        const svg = containerRef.current.querySelector("svg");
        if (svg) {
          svg.style.maxWidth = "100%";
          svg.style.height = "auto";
          svg.removeAttribute("height");
          setRendered(true);
        }
      } catch (err) {
        console.error("Mermaid error:", err);
        setError("Failed to render diagram");
        setRendered(true);
      }
    };
    
    render();
  }, [code, themeInfo.isDark]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <div className={cn(
        "rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground",
        className
      )}>
        {error}
      </div>
    );
  }

  return (
    <div className={cn(
      "group relative rounded-lg border border-border bg-card/50 overflow-hidden",
      expanded && "fixed inset-4 z-50 bg-background",
      className
    )}>
      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-md bg-background/90 border border-border hover:bg-muted transition-colors"
        >
          {expanded ? (
            <Minimize2 className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md bg-background/90 border border-border hover:bg-muted transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Diagram container */}
      <div 
        className={cn(
          "p-4 overflow-auto",
          expanded ? "h-full" : "min-h-[200px]"
        )}
      >
        <div
          ref={containerRef}
          className={cn(
            "[&_svg]:max-w-full [&_svg]:mx-auto",
            !rendered && "opacity-50"
          )}
        />
      </div>

      {/* Label */}
      <div className="px-3 py-1.5 border-t border-border bg-muted/20">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
          Diagram
        </span>
      </div>
      
      {expanded && (
        <div 
          className="fixed inset-0 bg-background/80 -z-10"
          onClick={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
