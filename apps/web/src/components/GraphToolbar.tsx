import { Network, Grid3x3, GitBranch, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export type GraphMode = "3d-force" | "2d-force" | "tree" | "radial";

interface GraphToolbarProps {
  mode: GraphMode;
  onModeChange: (mode: GraphMode) => void;
}

const modes = [
  { id: "3d-force" as const, label: "3D", icon: Network },
  { id: "2d-force" as const, label: "2D", icon: Grid3x3 },
  { id: "tree" as const, label: "Tree", icon: GitBranch },
  { id: "radial" as const, label: "Radial", icon: Radio },
];

export function GraphToolbar({ mode, onModeChange }: GraphToolbarProps) {
  return (
    <div className="absolute top-4 right-4 z-10 flex items-center bg-background border border-border rounded-lg p-1 shadow-sm">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onModeChange(m.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
            mode === m.id 
              ? "bg-foreground text-background" 
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <m.icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{m.label}</span>
        </button>
      ))}
    </div>
  );
}