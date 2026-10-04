import Queue from "bull";

// Initialize the queues (processors live in workers/ai-worker.ts).
// P0: enqueue is refuse-by-default so save-from-url / ai-crawler cannot
// start the invent→store→display path without an explicit override.
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

const INVENT_DISABLED_MSG =
  "AI parsing/valuation queue is disabled (P0: LLM must not invent market prices). " +
  "Set ENABLE_LLM_PRICE_INVENT=true only after invent→store→display is fully removed.";

export function isAiPriceInventQueueEnabled(): boolean {
  return process.env.ENABLE_LLM_PRICE_INVENT === "true";
}

// Helper function to add VDP URLs to the queue — fail closed by default.
export async function queueForAIParsing(
  sourceUrl: string,
  dealerId?: string,
  source?: string,
  options: AIParsingOptions = {},
) {
  if (!isAiPriceInventQueueEnabled()) {
    throw new Error(INVENT_DISABLED_MSG);
  }
  return aiParsingQueue.add(
    { sourceUrl, dealerId, source, ...options },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  );
}
