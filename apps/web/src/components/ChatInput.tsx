import { useState, useRef, useEffect } from "react";
import { ArrowUp, Keyboard } from "lucide-react";
import { Textarea } from "./ui/textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onShowShortcuts?: () => void;
}

export function ChatInput({ 
  onSendMessage, 
  disabled = false,
  placeholder = "Ask a question...",
  autoFocus = true,
  onShowShortcuts,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Global keyboard shortcut to focus input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Focus input on / or Cmd+K
      if (
        (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.shiftKey) ||
        ((e.metaKey || e.ctrlKey) && e.key === "k")
      ) {
        const activeElement = document.activeElement;
        const isInputFocused = 
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement;
        
        if (!isInputFocused) {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }
      
      // Clear input on Escape
      if (e.key === "Escape" && document.activeElement === textareaRef.current) {
        setMessage("");
        textareaRef.current?.blur();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <div className="border-t border-border bg-background">
      <div className="max-w-3xl mx-auto p-3 sm:p-4">
        <div className={cn(
          "relative flex items-end",
          "rounded-lg border border-border bg-background",
          "shadow-sm",
          "focus-within:border-foreground/20 focus-within:ring-1 focus-within:ring-foreground/10",
          "transition-all duration-200"
        )}>
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "flex-1 min-h-[44px] max-h-[200px] resize-none",
              "border-0 bg-transparent px-3 sm:px-4 py-3 pr-14 sm:pr-20",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "text-[15px] placeholder:text-muted-foreground"
            )}
            rows={1}
          />

          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            {/* Hide keyboard shortcut button on mobile */}
            {onShowShortcuts && (
              <button
                onClick={onShowShortcuts}
                type="button"
                className={cn(
                  "hidden sm:flex w-8 h-8 rounded-md",
                  "items-center justify-center",
                  "text-muted-foreground",
                  "hover:bg-muted hover:text-foreground",
                  "transition-colors"
                )}
                title="Keyboard shortcuts"
              >
                <Keyboard className="w-4 h-4" />
              </button>
            )}
            
            <button
              onClick={handleSubmit}
              disabled={disabled || !message.trim()}
              className={cn(
                "w-9 h-9 sm:w-8 sm:h-8 rounded-md",
                "flex items-center justify-center",
                "bg-foreground text-background",
                "hover:bg-foreground/90",
                "active:scale-95",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                "transition-all duration-200",
                message.trim() && !disabled && "animate-scale-in"
              )}
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Hide keyboard hints on mobile */}
        <div className="hidden sm:flex items-center justify-between mt-2 px-1">
          <p className="text-xs text-muted-foreground">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to send
          </p>
          <p className="text-xs text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-muted rounded text-xs">?</kbd> for shortcuts
          </p>
        </div>
      </div>
    </div>
  );
}
