import { describe, expect, it } from "vitest";
import {
  applyWorkerSupabaseUrl,
  resolveWorkerSupabaseUrl,
} from "./runtime-supabase-url";

describe("worker Supabase target", () => {
  it("prefers the server-only target when a local browser target is also present", () => {
    expect(
      resolveWorkerSupabaseUrl({
        SUPABASE_URL: " https://hosted.supabase.co/ ",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toBe("https://hosted.supabase.co/");
  });

  it("falls back to the public target when no server-only target is configured", () => {
    expect(
      resolveWorkerSupabaseUrl({
        SUPABASE_URL: " ",
        NEXT_PUBLIC_SUPABASE_URL: " https://fallback.supabase.co ",
      }),
    ).toBe("https://fallback.supabase.co");
  });

  it("normalizes legacy scraper modules onto the resolved worker target", () => {
    const env = {
      SUPABASE_URL: "https://hosted.supabase.co",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    };

    expect(applyWorkerSupabaseUrl(env)).toBe("https://hosted.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://hosted.supabase.co");
  });
});
