import { embed, embedMany } from "ai";
import { google } from "./config";

// gemini-embedding-001 (replaces retired text-embedding-004); pin 768 dims for pgvector
const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");

/**
 * Generates a vector embedding for a given text string.
 * This can be used to store embeddings in Supabase (pgvector) for similarity search.
 * outputDimensionality: 768 matches the deals.embedding vector(768) column.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
      providerOptions: { google: { outputDimensionality: 768 } },
    });
    return embedding;
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    throw error;
  }
}

/**
 * Embed several texts in one batchEmbedContents call (the Google provider caps a call at 100).
 * maxRetries: 0 — the caller (backfill) owns 429 handling so it can respect RetryInfo, stop for
 * the day on daily-quota errors, and keep its own free-tier accounting honest. Note Gemini counts
 * each text in the batch as one request against RPM/RPD.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts,
    maxRetries: 0,
    providerOptions: { google: { outputDimensionality: 768 } },
  });
  return embeddings;
}
