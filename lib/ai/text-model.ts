// lib/ai/text-model.ts
// Single place that picks the text-generation model.
// Prefer Anthropic Haiku for narrate-only features (NO price invent).
// OpenAI key was removed; Google remains a fallback for structured scrape extract.
// Never use any of these models to invent wholesale/retail stored as mmr_value.

import { google } from "./config";

export function hasTextModel(): boolean {
  return (
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.OPENAI_API_KEY ||
    !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
}

export function getTextModel() {
  // Prefer Anthropic Haiku (narrate-only). Package optional until installed.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { anthropic } = require("@ai-sdk/anthropic");
      return anthropic("claude-haiku-4-5");
    } catch {
      // @ai-sdk/anthropic not installed yet — fall through.
    }
  }
  if (process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openai } = require("@ai-sdk/openai");
    return openai("gpt-4o-mini");
  }
  return google("gemini-2.0-flash");
}

export function getPremiumTextModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { anthropic } = require("@ai-sdk/anthropic");
      // Still Haiku for cost; premium narrate can bump later — never for inventing prices.
      return anthropic("claude-haiku-4-5");
    } catch {
      // fall through
    }
  }
  if (process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openai } = require("@ai-sdk/openai");
    return openai("gpt-4o");
  }
  return google("gemini-2.5-pro");
}

export function activeProvider(): "anthropic" | "openai" | "google" | "none" {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      require.resolve("@ai-sdk/anthropic");
      return "anthropic";
    } catch {
      // key present but SDK missing
    }
  }
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google";
  return "none";
}
