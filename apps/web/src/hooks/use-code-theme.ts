import { useState, useEffect, createContext, useContext } from "react";

export type CodeTheme = 
  | "one-dark"
  | "one-light"
  | "dracula"
  | "nord"
  | "github"
  | "material-dark"
  | "material-light"
  | "synthwave84"
  | "night-owl"
  | "vs-dark"
  | "solarized-light";

export interface CodeThemeInfo {
  id: CodeTheme;
  name: string;
  isDark: boolean;
  cssClass: string;
  preview: {
    bg: string;
    accent: string;
  };
}

export const CODE_THEMES: CodeThemeInfo[] = [
  { 
    id: "one-dark", 
    name: "One Dark", 
    isDark: true, 
    cssClass: "",
    preview: { bg: "#282c34", accent: "#61afef" }
  },
  { 
    id: "one-light", 
    name: "One Light", 
    isDark: false, 
    cssClass: "theme-one-light",
    preview: { bg: "#fafafa", accent: "#4078f2" }
  },
  { 
    id: "dracula", 
    name: "Dracula", 
    isDark: true, 
    cssClass: "theme-dracula",
    preview: { bg: "#282a36", accent: "#ff79c6" }
  },
  { 
    id: "nord", 
    name: "Nord", 
    isDark: true, 
    cssClass: "theme-nord",
    preview: { bg: "#2e3440", accent: "#88c0d0" }
  },
  { 
    id: "github", 
    name: "GitHub", 
    isDark: false, 
    cssClass: "theme-github",
    preview: { bg: "#ffffff", accent: "#0969da" }
  },
  { 
    id: "material-dark", 
    name: "Material Dark", 
    isDark: true, 
    cssClass: "theme-material-dark",
    preview: { bg: "#263238", accent: "#00bcd4" }
  },
  { 
    id: "material-light", 
    name: "Material Light", 
    isDark: false, 
    cssClass: "theme-material-light",
    preview: { bg: "#fafafa", accent: "#00bcd4" }
  },
  { 
    id: "synthwave84", 
    name: "Synthwave '84", 
    isDark: true, 
    cssClass: "theme-synthwave84",
    preview: { bg: "#2b213a", accent: "#ff7edb" }
  },
  { 
    id: "night-owl", 
    name: "Night Owl", 
    isDark: true, 
    cssClass: "theme-night-owl",
    preview: { bg: "#011627", accent: "#00d9ff" }
  },
  { 
    id: "vs-dark", 
    name: "VS Dark", 
    isDark: true, 
    cssClass: "theme-vs-dark",
    preview: { bg: "#1e1e1e", accent: "#569cd6" }
  },
  { 
    id: "solarized-light", 
    name: "Solarized Light", 
    isDark: false, 
    cssClass: "theme-solarized-light",
    preview: { bg: "#fdf6e3", accent: "#268bd2" }
  },
];

const STORAGE_KEY = "nexu-code-theme";

interface CodeThemeContextType {
  theme: CodeTheme;
  setTheme: (theme: CodeTheme) => void;
  themeInfo: CodeThemeInfo;
}

const CodeThemeContext = createContext<CodeThemeContextType | undefined>(undefined);

export function useCodeTheme() {
  const context = useContext(CodeThemeContext);
  if (!context) {
    throw new Error("useCodeTheme must be used within CodeThemeProvider");
  }
  return context;
}

export { CodeThemeContext };

export function useCodeThemeState() {
  const [theme, setThemeState] = useState<CodeTheme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && CODE_THEMES.some(t => t.id === stored)) {
        return stored as CodeTheme;
      }
    }
    return "one-dark";
  });

  const themeInfo = CODE_THEMES.find(t => t.id === theme) || CODE_THEMES[0];

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    
    // Remove all theme classes
    CODE_THEMES.forEach(t => {
      if (t.cssClass) {
        root.classList.remove(t.cssClass);
      }
    });
    
    // Add current theme class
    if (themeInfo.cssClass) {
      root.classList.add(themeInfo.cssClass);
    }
    
    // Store preference
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, themeInfo]);

  return { theme, setTheme: setThemeState, themeInfo };
}
