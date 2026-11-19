"use client";

import { useEffect, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { initializeDatabase } from "@/lib/db/seed";
import { updateAppSettings } from "@/lib/db/repositories";
import type { AppSettings } from "@/types/models";
import { searchEngine } from "@/lib/search/minisearch";
import { CommandPaletteModal } from "@/modules/inbox-projects/components/CommandPaletteModal";
import { aiService } from "@/modules/ai-copilot/services/ai-service";
import { applyThemeTokens } from "@/lib/theme/apply-theme-tokens";

export function AppShell({ children }: { children: ReactNode }) {
  const settings = useLiveQuery(() => db.settings.get("default"));

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || !(event.key === "\\" || event.code === "Backslash")) return;
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        (activeElement.isContentEditable || activeElement.matches("input, textarea, select, [role='textbox']"))
      ) {
        return;
      }
      event.preventDefault();
      window.dispatchEvent(new Event("pkm:toggle-left-sidebar"));
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    void (async () => {
      await initializeDatabase();
      await searchEngine.initialize();
    })();
  }, []);

  useEffect(() => {
    aiService.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!settings) return;

    applyThemeTokens(settings);

    const missing: Partial<Pick<
      AppSettings,
      "themePreset" | "surfaceStyle" | "borderRadius" | "glowIntensity" | "density" | "headingStyle"
    >> = {};
    if (settings.themePreset === undefined) missing.themePreset = "obsidian-lime";
    if (settings.surfaceStyle === undefined) missing.surfaceStyle = "obsidian";
    if (settings.borderRadius === undefined) missing.borderRadius = "organic";
    if (settings.glowIntensity === undefined) missing.glowIntensity = "subtle";
    if (settings.density === undefined) missing.density = "comfortable";
    if (settings.headingStyle === undefined) missing.headingStyle = "editorial-serif";
    if (Object.keys(missing).length > 0) {
      void updateAppSettings(missing).catch((error: unknown) => {
        console.error("La migration des préférences d’apparence a échoué.", error);
      });
    }
  }, [settings]);

  return (
    <div className="h-screen overflow-hidden overflow-x-hidden bg-[var(--bg-primary)] pb-20 text-[var(--text-primary)] md:pb-0">
      {children}
      <CommandPaletteModal />
    </div>
  );
}
