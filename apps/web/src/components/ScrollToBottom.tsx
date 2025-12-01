import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollToBottomProps {
  visible: boolean;
  onClick: () => void;
}

export function ScrollToBottom({ visible, onClick }: ScrollToBottomProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-32 left-1/2 -translate-x-1/2 z-10",
        "flex items-center gap-2 px-3 py-2",
        "bg-background/95 backdrop-blur-sm",
        "border border-border rounded-full",
        "text-sm text-muted-foreground",
        "shadow-lg",
        "hover:bg-muted hover:text-foreground",
        "transition-all duration-200",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <ArrowDown className="w-4 h-4" />
      <span>New messages</span>
    </button>
  );
}
