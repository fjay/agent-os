"use client";

import { useState, useEffect } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/query-client";
import { parseTheme, getAllThemes } from "@/lib/theme-config";

function ThemeClassHandler({ children }: { children: React.ReactNode }) {
  const { theme, systemTheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    let actualTheme = theme;
    if (theme === "system") {
      actualTheme = systemTheme || "dark";
    }
    const { mode, variant } = parseTheme(actualTheme || "dark");
    root.classList.remove("dark", "light");
    root.removeAttribute("data-theme-variant");
    root.classList.add(mode === "system" ? "dark" : mode);
    if (variant && variant !== "default" && variant !== "deep") {
      root.setAttribute("data-theme-variant", variant);
    }
  }, [theme, systemTheme]);

  return <>{children}</>;
}

function ResumeQueryRefetcher({ queryClient }: { queryClient: QueryClient }) {
  useEffect(() => {
    let hiddenAt: number | null =
      document.visibilityState === "hidden" ? Date.now() : null;
    let refetchTimeout: ReturnType<typeof setTimeout> | null = null;

    const refetchActiveQueries = () => {
      if (document.visibilityState !== "visible") return;

      if (refetchTimeout) {
        clearTimeout(refetchTimeout);
      }

      refetchTimeout = setTimeout(() => {
        refetchTimeout = null;
        queryClient.refetchQueries({ type: "active" });
      }, 250);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      const wasHiddenFor = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;

      if (wasHiddenFor > 5000) {
        refetchActiveQueries();
      }
    };

    const handleResume = () => {
      refetchActiveQueries();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("online", handleResume);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handleResume);
      window.removeEventListener("focus", handleResume);
      window.removeEventListener("online", handleResume);
      if (refetchTimeout) {
        clearTimeout(refetchTimeout);
      }
    };
  }, [queryClient]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ResumeQueryRefetcher queryClient={queryClient} />
      <NextThemesProvider
        attribute="data-theme"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
        themes={getAllThemes()}
      >
        <ThemeClassHandler>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </ThemeClassHandler>
      </NextThemesProvider>
    </QueryClientProvider>
  );
}
