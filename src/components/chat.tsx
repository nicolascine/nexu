// Chat component with streaming support
'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { CodeBlock } from './code-block';
import { StatusBadge } from './status-badge';

interface CodeChunk {
  filepath: string;
  content: string;
  startLine: number;
  endLine: number;
  nodeType: string;
  name: string;
  language: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: CodeChunk[];
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSources, setShowSources] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let sources: CodeChunk[] = [];

      // Add empty assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [] }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          // Parse Vercel AI SDK format
          // 0:"text" for text chunks
          // 2:[...] for metadata (sources)
          if (line.startsWith('0:')) {
            try {
              const text = JSON.parse(line.slice(2));
              assistantContent += text;
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.role === 'assistant') {
                  lastMsg.content = assistantContent;
                  lastMsg.sources = sources;
                }
                return newMessages;
              });
            } catch {
              // ignore parse errors
            }
          } else if (line.startsWith('2:')) {
            try {
              const metadata = JSON.parse(line.slice(2));
              if (Array.isArray(metadata)) {
                // Extract sources from metadata
                for (const item of metadata) {
                  if (item?.sources) {
                    sources = item.sources;
                  }
                }
              }
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.role === 'assistant') {
                  lastMsg.sources = sources;
                }
                return newMessages;
              });
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex-none p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">nexu</h1>
            <p className="text-sm text-text-secondary">Ask questions about your codebase</p>
          </div>
          <StatusBadge />
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-text-secondary">
            <p className="text-lg mb-2">Start a conversation</p>
            <p className="text-sm">Ask questions about the indexed codebase</p>
          </div>
        )}

        {messages.map((message, i) => (
          <div
            key={i}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-accent text-white'
                  : 'bg-surface border border-border'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm">{message.content || '...'}</div>

              {/* Sources toggle for assistant messages */}
              {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <button
                    onClick={() => setShowSources(showSources === i ? null : i)}
                    className="text-xs text-accent hover:underline"
                  >
                    {showSources === i ? 'Hide' : 'Show'} {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
                  </button>

                  {showSources === i && (
                    <div className="mt-2 space-y-2">
                      {message.sources.map((source, j) => (
                        <CodeBlock
                          key={j}
                          code={source.content}
                          language={source.language}
                          filename={source.filepath}
                          startLine={source.startLine}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-surface border border-border rounded-lg px-4 py-2">
              <div className="flex items-center gap-2 text-text-secondary text-sm">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex-none p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about the codebase..."
            disabled={isLoading}
            className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-accent text-white px-6 py-2 rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
