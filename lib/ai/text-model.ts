// lib/ai/text-model.ts
// Single place that picks the text-generation model. Prefers OpenAI when OPENAI_API_KEY is set
// (you added it), otherwise falls back to the already-configured Google provider. Either key alone
// is enough; if neither is present, callers should degrade gracefully (see hasTextModel).

import { google } from "./config";

export function hasTextModel(): boolean {
  return (
    !!process.env.OPENAI_API_KEY || !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
}

export function getTextModel() {
  if (process.env.OPENAI_API_KEY) {
    // Lazy require so the package isn't needed when only Google is configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openai } = require("@ai-sdk/openai");
    return openai("gpt-4o-mini");
  }
  return google("gemini-2.0-flash");
}

export function getPremiumTextModel() {
  if (process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openai } = require("@ai-sdk/openai");
    return openai("gpt-4o");
  }
  // Fall back to pro model for Google
  return google("gemini-2.5-pro");
}

export function activeProvider(): "openai" | "google" | "none" {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google";
  return "none";
}
