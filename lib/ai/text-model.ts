// lib/ai/text-model.ts
// Single place that picks the text-generation model.
// Prefer Anthropic Haiku for narrate-only features (deal briefs, analyst
// wording). Never use this module to invent wholesale, retail, MMR, or
// market value. Those stay fetched-data only.

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "./config";

/** Dated Haiku snapshot. Override with ANTHROPIC_MODEL; Opus is refused. */
export const HAIKU_NARRATIVE_MODEL = "claude-haiku-4-5-20251001";

function narrativeModelId(): string {
  const requested = process.env.ANTHROPIC_MODEL?.trim();
  if (!requested) return HAIKU_NARRATIVE_MODEL;
  if (requested.toLowerCase().includes("opus")) return HAIKU_NARRATIVE_MODEL;
  return requested;
}

export function hasTextModel(): boolean {
  return (
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.OPENAI_API_KEY ||
    !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
}

export function getTextModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(narrativeModelId());
  }
  if (process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openai } = require("@ai-sdk/openai");
    return openai("gpt-4o-mini");
  }
  return google("gemini-2.0-flash");
}

export function getPremiumTextModel() {
  // Premium narrate stays on Haiku too. No Opus, and no price invention.
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(narrativeModelId());
  }
  if (process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openai } = require("@ai-sdk/openai");
    return openai("gpt-4o");
  }
  return google("gemini-2.5-pro");
}

export function activeProvider(): "anthropic" | "openai" | "google" | "none" {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google";
  return "none";
}
