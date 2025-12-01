import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
  dracula,
  nord,
  ghcolors,
  materialDark,
  materialLight,
  synthwave84,
  nightOwl,
  vscDarkPlus,
  solarizedlight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCodeTheme, CodeTheme, CODE_THEMES } from "@/hooks/use-code-theme";

const THEME_STYLES: Record<CodeTheme, { style: any; bg: string }> = {
  "one-dark": { style: oneDark, bg: "hsl(220 13% 18%)" },
  "one-light": { style: oneLight, bg: "hsl(230 1% 98%)" },
  "dracula": { style: dracula, bg: "hsl(231 15% 18%)" },
  "nord": { style: nord, bg: "hsl(220 16% 22%)" },
  "github": { style: ghcolors, bg: "hsl(0 0% 100%)" },
  "material-dark": { style: materialDark, bg: "hsl(200 19% 18%)" },
  "material-light": { style: materialLight, bg: "hsl(0 0% 98%)" },
  "synthwave84": { style: synthwave84, bg: "hsl(261 44% 15%)" },
  "night-owl": { style: nightOwl, bg: "hsl(207 95% 8%)" },
  "vs-dark": { style: vscDarkPlus, bg: "hsl(0 0% 12%)" },
  "solarized-light": { style: solarizedlight, bg: "hsl(44 87% 94%)" },
};

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  fileName?: string;
}

export function CodeBlock({ 
  code, 
  language = "typescript", 
  showLineNumbers = false,
  fileName 
}: CodeBlockProps) {
  const { theme } = useCodeTheme();
  const [copied, setCopied] = useState(false);
  
  const themeConfig = THEME_STYLES[theme];
  const themeInfo = CODE_THEMES.find(t => t.id === theme);
  const isDark = themeInfo?.isDark ?? true;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3">
      {fileName && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted rounded-t-md border border-b-0 border-border">
          <span className="text-xs font-mono text-muted-foreground">{fileName}</span>
        </div>
      )}
      <div className={cn(
        "relative rounded-md overflow-hidden border border-border",
        fileName && "rounded-t-none"
      )}>
        <button
          onClick={handleCopy}
          className={cn(
            "absolute top-2 right-2 p-1.5 rounded-md z-10",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isDark 
              ? "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
              : "bg-black/5 hover:bg-black/10 text-black/50 hover:text-black/70"
          )}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        <SyntaxHighlighter
          language={language}
          style={themeConfig.style}
          showLineNumbers={showLineNumbers}
          customStyle={{
            margin: 0,
            padding: "0.875rem 1rem",
            background: themeConfig.bg,
            fontSize: "14px",
            lineHeight: "1.5",
            borderRadius: fileName ? "0" : "0.375rem",
          }}
          codeTagProps={{
            style: {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            },
          }}
          lineNumberStyle={{
            minWidth: "2.5em",
            paddingRight: "1em",
            color: isDark ? "hsl(0 0% 35%)" : "hsl(0 0% 65%)",
            userSelect: "none",
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
