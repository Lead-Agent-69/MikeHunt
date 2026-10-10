"use client";
import { usePreferences } from "@/hooks/usePreferences";
import { workspaceIsExpanded, type WorkspaceMode } from "@/lib/workspace";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { mutate } from "swr";

export function useWorkspace() {
  const { prefs, authed, isLoading, error } = usePreferences();
  const { intent } = useBuyerIntent();
  const expanded = workspaceIsExpanded(intent?.buyerMode, prefs.workspaceMode);
  async function choose(mode: WorkspaceMode) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceMode: mode }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (
        !response.ok ||
        result.authed !== true ||
        result.prefs?.workspaceMode !== mode ||
        result.prefs?.workspaceAccess !== "community"
      )
        throw new Error(
          "Workspace change was not confirmed. Reload and try again.",
        );
      await mutate("/api/preferences", result, { revalidate: false });
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    expanded,
    choose,
    authed,
    isLoading,
    error,
    mode: prefs.workspaceMode,
    community: prefs.workspaceAccess === "community",
  };
}
