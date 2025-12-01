import { Palette, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCodeTheme, CODE_THEMES } from "@/hooks/use-code-theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export function CodeThemeSelector() {
  const { theme, setTheme, themeInfo } = useCodeTheme();

  const darkThemes = CODE_THEMES.filter(t => t.isDark);
  const lightThemes = CODE_THEMES.filter(t => !t.isDark);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "p-1.5 rounded-md transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title={`Theme: ${themeInfo.name}`}
        >
          <Palette className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Dark Themes
        </DropdownMenuLabel>
        {darkThemes.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex items-center gap-3 cursor-pointer",
              theme === t.id && "bg-accent"
            )}
          >
            <div 
              className="w-4 h-4 rounded-sm border border-border/50 flex items-center justify-center"
              style={{ backgroundColor: t.preview.bg }}
            >
              <div 
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: t.preview.accent }}
              />
            </div>
            <span className="text-sm flex-1">{t.name}</span>
            {theme === t.id && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Light Themes
        </DropdownMenuLabel>
        {lightThemes.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex items-center gap-3 cursor-pointer",
              theme === t.id && "bg-accent"
            )}
          >
            <div 
              className="w-4 h-4 rounded-sm border border-border/50 flex items-center justify-center"
              style={{ backgroundColor: t.preview.bg }}
            >
              <div 
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: t.preview.accent }}
              />
            </div>
            <span className="text-sm flex-1">{t.name}</span>
            {theme === t.id && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}