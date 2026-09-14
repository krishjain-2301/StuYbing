"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme, ready } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={ready ? (theme === "dark" ? "Light mode" : "Dark mode") : "Theme"}
    >
      <span className="theme-toggle-track" data-mode={theme}>
        <span className="theme-toggle-thumb" />
      </span>
      <span className="hidden text-xs font-medium sm:inline">
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
