import { ReactNode } from "react";
import { CodeThemeContext, useCodeThemeState } from "@/hooks/use-code-theme";

export function CodeThemeProvider({ children }: { children: ReactNode }) {
  const themeState = useCodeThemeState();
  
  return (
    <CodeThemeContext.Provider value={themeState}>
      {children}
    </CodeThemeContext.Provider>
  );
}
