import { afterEach, describe, expect, it } from "vitest";
import {
  HAIKU_NARRATIVE_MODEL,
  activeProvider,
  getPremiumTextModel,
  getTextModel,
  hasTextModel,
} from "./text-model";

const KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("narrate-only text model", () => {
  it("prefers Anthropic Haiku and refuses Opus", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_MODEL = "claude-opus-4-1";
    process.env.OPENAI_API_KEY = "openai-key";

    expect(hasTextModel()).toBe(true);
    expect(activeProvider()).toBe("anthropic");
    const model = getTextModel() as { modelId?: string; provider?: string };
    expect(model.modelId).toBe(HAIKU_NARRATIVE_MODEL);
    expect(model.provider).toBe("anthropic.messages");
    const premium = getPremiumTextModel() as { modelId?: string };
    expect(premium.modelId).toBe(HAIKU_NARRATIVE_MODEL);
    expect(HAIKU_NARRATIVE_MODEL.toLowerCase()).not.toContain("opus");
  });

  it("uses a non-Opus ANTHROPIC_MODEL override", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5";
    const model = getTextModel() as { modelId?: string };
    expect(model.modelId).toBe("claude-haiku-4-5");
  });

  it("has no OpenAI or Gemini fallback", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "gemini-key";
    expect(activeProvider()).toBe("none");
    expect(hasTextModel()).toBe(false);
    const model = getTextModel() as { provider?: string };
    expect(model.provider).toBe("anthropic.messages");
  });

  it("returns a model spec version the installed ai SDK can run", () => {
    // ai@6 only accepts v2/v3 language models; @ai-sdk/anthropic@4 (v4) throws
    // UnsupportedModelVersionError at generateText time.
    process.env.ANTHROPIC_API_KEY = "test-key";
    const model = getTextModel() as { specificationVersion?: string };
    expect(["v2", "v3"]).toContain(model.specificationVersion);
  });
});
