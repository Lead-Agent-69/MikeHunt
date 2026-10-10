import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getTextModel, hasTextModel } from "./text-model";

export const DOCUMENT_GOOGLE_MODEL = "gemini-2.5-flash-lite";

export function hasDocumentModel(): boolean {
  return hasTextModel() || !!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
}

// Provider selection is configuration-based, not an automatic retry that sends a
// failed document to a second provider. Narrative/valuation behavior is unchanged.
export function getDocumentModel() {
  if (hasTextModel()) return getTextModel();
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) throw new Error("Document extraction is not configured");
  return createGoogleGenerativeAI({ apiKey })(DOCUMENT_GOOGLE_MODEL);
}
