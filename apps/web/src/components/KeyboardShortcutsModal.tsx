import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

const shortcuts: { category: string; items: Shortcut[] }[] = [
  {
    category: "Navigation",
    items: [
      { keys: ["⌘", "K"], description: "Focus input" },
      { keys: ["/"], description: "Focus input (alternative)" },
      { keys: ["Esc"], description: "Clear input / Close modal" },
      { keys: ["⌘", "G"], description: "Toggle graph view" },
    ],
  },
  {
    category: "Chat",
    items: [
      { keys: ["Enter"], description: "Send message" },
      { keys: ["Shift", "Enter"], description: "New line" },
      { keys: ["⌘", "R"], description: "Retry last query" },
    ],
  },
  {
    category: "Debug",
    items: [
      { keys: ["⌘", "D"], description: "Toggle debug panel" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
    ],
  },
  {
    category: "Citations",
    items: [
      { keys: ["⌘", "1-9"], description: "Jump to citation N" },
      { keys: ["⌘", "C"], description: "Copy selected code" },
    ],
  },
];

export function KeyboardShortcutsModal({
  open,
  onOpenChange,
}: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {group.category}
              </h3>
              <div className="space-y-2">
                {group.items.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <kbd
                          key={keyIndex}
                          className={cn(
                            "inline-flex items-center justify-center",
                            "min-w-[24px] h-6 px-1.5",
                            "text-xs font-medium",
                            "bg-muted text-muted-foreground",
                            "border border-border rounded",
                            "shadow-sm"
                          )}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-center pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">?</kbd> to toggle this modal
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
