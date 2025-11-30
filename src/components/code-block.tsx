// Code block component with syntax highlighting placeholder
'use client';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  startLine?: number;
}

export function CodeBlock({ code, language, filename, startLine }: CodeBlockProps) {
  return (
    <div className="rounded-md border border-border overflow-hidden text-sm">
      {filename && (
        <div className="bg-surface px-3 py-1.5 text-text-secondary text-xs border-b border-border flex items-center gap-2">
          <span className="font-mono">{filename}</span>
          {startLine && (
            <span className="text-text-secondary/60">L{startLine}</span>
          )}
          {language && (
            <span className="ml-auto text-text-secondary/60">{language}</span>
          )}
        </div>
      )}
      <pre className="p-3 overflow-x-auto bg-background">
        <code className="font-mono text-text-primary text-xs leading-relaxed whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}
