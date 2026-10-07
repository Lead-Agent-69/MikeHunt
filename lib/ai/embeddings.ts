import { embed } from "ai";
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
