import { useState, useMemo, ReactNode } from "react";
import { FileCode, GitGraph, Network, FlameKindling, Thermometer, GitCommit, Workflow, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { Citation } from "./ChatMessage";

interface Tab {
  id: string;
  label: string;
  icon: ReactNode;
  available: boolean;
}

interface ResponseTabsProps {
  content: string;
  citations?: Citation[];
  children: (activeTab: string) => ReactNode;
}

export function ResponseTabs({ content, citations, children }: ResponseTabsProps) {
  const [activeTab, setActiveTab] = useState("text");

  // Detect which tabs should be available based on content and citations
  const tabs = useMemo<Tab[]>(() => {
    const hasMermaid = /```mermaid[\s\S]*?```/.test(content);
    const hasCodeBlock = /```(?!mermaid)(\w+)?\n[\s\S]*?```/.test(content);
    const hasCitations = citations && citations.length > 0;
    const hasImports = /import\s+.*from|require\(/.test(content);
    const hasFunctions = /function\s+\w+|const\s+\w+\s*=\s*(async\s+)?\(/.test(content);
    
    // Check citations for code that could be analyzed
    const citationCode = citations?.map(c => c.code).join("\n") || "";
    const allCode = content + "\n" + citationCode;
    const citationHasImports = /import\s+.*from|require\(/.test(citationCode);
    const citationHasFunctions = /function\s+\w+|const\s+\w+\s*=\s*(async\s+)?\(|async\s+\w+\s*\(/.test(citationCode);
    const hasTypes = /interface\s+\w+|type\s+\w+\s*=|:\s*\w+[\w<>,\s]*/.test(allCode);
    
    return [
      { id: "text", label: "Response", icon: <FileCode className="w-3.5 h-3.5" />, available: true },
      { id: "diagram", label: "Diagram", icon: <Workflow className="w-3.5 h-3.5" />, available: hasMermaid },
      { id: "ast", label: "AST", icon: <GitGraph className="w-3.5 h-3.5" />, available: hasCitations || hasCodeBlock },
      { id: "deps", label: "Dependencies", icon: <Network className="w-3.5 h-3.5" />, available: hasImports || citationHasImports },
      { id: "calls", label: "Call Graph", icon: <FlameKindling className="w-3.5 h-3.5" />, available: hasFunctions || citationHasFunctions },
      { id: "complexity", label: "Complexity", icon: <Thermometer className="w-3.5 h-3.5" />, available: hasFunctions || citationHasFunctions },
      { id: "blame", label: "Git Blame", icon: <GitCommit className="w-3.5 h-3.5" />, available: hasCitations },
      { id: "types", label: "Type Flow", icon: <Route className="w-3.5 h-3.5" />, available: hasTypes },
    ];
  }, [content, citations]);

  const availableTabs = tabs.filter(t => t.available);
  
  // Only show tabs if there's more than just the default "Response" tab
  const showTabs = availableTabs.length > 1;

  return (
    <div className="w-full">
      {showTabs && (
        <div className="flex items-center gap-1 mb-3 pb-2 border-b border-border/50 overflow-x-auto">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}
      
      {children(activeTab)}
    </div>
  );
}
