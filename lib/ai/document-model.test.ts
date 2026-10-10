import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_GOOGLE_MODEL,
  getDocumentModel,
  hasDocumentModel,
} from "./document-model";

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("document-only provider", () => {
  it("uses the configured Google key without altering narration", () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    expect(hasDocumentModel()).toBe(true);
    const model = getDocumentModel();
    expect(model.modelId).toBe(DOCUMENT_GOOGLE_MODEL);
    expect(model.provider).toContain("google");
    expect(["v2", "v3"]).toContain(model.specificationVersion);
  });
  it("preserves Anthropic priority when configured", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    expect(getDocumentModel().provider).toContain("anthropic");
  });
  it("does not invent a provider without a configured key", () => {
    expect(hasDocumentModel()).toBe(false);
    expect(() => getDocumentModel()).toThrow("not configured");
  });
});
