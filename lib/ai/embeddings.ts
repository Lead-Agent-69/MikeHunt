import { embed } from 'ai';
import { google } from './config';

// The embedding model
const embeddingModel = google.textEmbeddingModel('text-embedding-004');

/**
 * Generates a vector embedding for a given text string.
 * This can be used to store embeddings in Supabase (pgvector) for similarity search.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
    });
    return embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    throw error;
  }
}
