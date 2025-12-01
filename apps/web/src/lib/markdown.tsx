import { CodeBlock } from "@/components/CodeBlock";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { ReactNode } from "react";
import { marked } from "marked";

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

interface CodeBlockMatch {
  type: "code";
  language: string;
  code: string;
}

interface MermaidBlockMatch {
  type: "mermaid";
  code: string;
}

interface TextMatch {
  type: "text";
  content: string;
}

type ContentBlock = CodeBlockMatch | MermaidBlockMatch | TextMatch;

export function parseMarkdownWithCode(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      blocks.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }

    const language = match[1] || "typescript";
    const code = match[2].trim();

    // Check if it's a mermaid diagram
    if (language === "mermaid") {
      blocks.push({
        type: "mermaid",
        code,
      });
    } else {
      blocks.push({
        type: "code",
        language,
        code,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    blocks.push({
      type: "text",
      content: content.slice(lastIndex),
    });
  }

  return blocks;
}

export function renderMarkdownContent(content: string): ReactNode[] {
  const blocks = parseMarkdownWithCode(content);
  
  return blocks.map((block, index) => {
    // In the Response tab, we skip mermaid blocks (they're shown in Diagram tab)
    if (block.type === "mermaid") {
      return null;
    }
    
    if (block.type === "code") {
      return (
        <CodeBlock
          key={index}
          code={block.code}
          language={block.language}
          showLineNumbers={true}
        />
      );
    }
    
    // Parse markdown text to HTML
    const html = marked.parse(block.content) as string;
    return (
      <div
        key={index}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }).filter(Boolean);
}

export function renderDiagramOnly(content: string): ReactNode[] {
  const blocks = parseMarkdownWithCode(content);
  
  const mermaidBlocks = blocks.filter(block => block.type === "mermaid");
  
  if (mermaidBlocks.length === 0) {
    return [<div key="no-diagram" className="text-muted-foreground text-sm">No diagram available</div>];
  }
  
  return mermaidBlocks.map((block, index) => {
    if (block.type === "mermaid") {
      return (
        <MermaidDiagram
          key={index}
          code={block.code}
          className="my-2"
        />
      );
    }
    return null;
  }).filter(Boolean);
}

export function extractAllCode(content: string): string {
  const blocks = parseMarkdownWithCode(content);
  return blocks
    .filter(block => block.type === "code")
    .map(block => (block as CodeBlockMatch).code)
    .join("\n\n");
}
