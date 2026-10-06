// lib/ai/text-model.ts
// Single place that picks the text-generation model.
// Prefer Anthropic Haiku for narrate-only features (deal briefs, analyst
// wording). Never use this module to invent wholesale, retail, MMR, or
// market value. Those stay fetched-data only.

import { anthropic } from "@ai-sdk/anthropic";

/** Dated Haiku snapshot. Override with ANTHROPIC_MODEL; Opus is refused. */
export const HAIKU_NARRATIVE_MODEL = "claude-haiku-4-5-20251001";

function narrativeModelId(): string {
  const requested = process.env.ANTHROPIC_MODEL?.trim();
  if (!requested) return HAIKU_NARRATIVE_MODEL;
  if (requested.toLowerCase().includes("opus")) return HAIKU_NARRATIVE_MODEL;
  return requested;
}

export function hasTextModel(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Narrate-only model. Anthropic Haiku when ANTHROPIC_API_KEY is set; there is no OpenAI or Gemini
 * fallback. Callers must check hasTextModel() first and fall back to deterministic copy, so no paid
 * key is required at runtime. (A local Ollama provider can slot in here later.)
 */
export function getTextModel() {
  return anthropic(narrativeModelId());
}

export function getPremiumTextModel() {
  // Premium narrate stays on Haiku too. No Opus, and no price invention.
  return anthropic(narrativeModelId());
}

export function activeProvider(): "anthropic" | "none" {
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "none";
}
