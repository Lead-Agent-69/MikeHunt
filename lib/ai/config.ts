import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Create a configured Google provider
export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// We can export configured models here for reuse
export const defaultModel = google("gemini-2.0-flash");
export const structuredModel = google("gemini-2.0-flash"); // current free-tier flash; handles JSON schema extraction
