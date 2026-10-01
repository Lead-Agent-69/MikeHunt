import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalScraperCache } from "./local-cache";

export interface LocalWriteContext {
  cache: LocalScraperCache;
  supabase?: SupabaseClient;
  cacheOnly: boolean;
  beforeWrite?: () => Promise<boolean>;
  respectAccessBlocks?: boolean;
  onAccessBarrier?: (barrier: {
    host: string;
    status: number;
    reason: string;
  }) => void;
}

const storage = new AsyncLocalStorage<LocalWriteContext>();

export function withLocalWriteContext<T>(
  context: LocalWriteContext,
  run: () => Promise<T>,
): Promise<T> {
  return storage.run(context, run);
}

export function getLocalWriteContext(): LocalWriteContext | undefined {
  return storage.getStore();
}
