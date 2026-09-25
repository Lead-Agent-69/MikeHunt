import Queue from "bull";

// Initialize the queues
export const aiParsingQueue = new Queue(
  "ai-parsing",
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
);
export const aiValuationQueue = new Queue(
  "ai-valuation",
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
);

interface AIParsingOptions {
  savedCarId?: string | null;
  userId?: string;
}

// Helper function to add VDP URLs to the queue
export async function queueForAIParsing(
  sourceUrl: string,
  dealerId?: string,
  source?: string,
  options: AIParsingOptions = {},
) {
  return aiParsingQueue.add(
    { sourceUrl, dealerId, source, ...options },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  );
}
