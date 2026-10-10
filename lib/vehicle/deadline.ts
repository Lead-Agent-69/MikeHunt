// Upstream time budget for the public VIN routes. One request can chain up to ~13 upstream calls
// (vPIC decode, recalls catalog + up to 12 recall names, safety x2, EPA x2, mcp.vin fallback), so each
// call gets its own timeout AND the request has one overall deadline. Once the deadline passes, the
// remaining calls are skipped (callers treat that as "unknown", never as a fake zero).

/** Per-call timeout for any single upstream request. */
export const UPSTREAM_CALL_TIMEOUT_MS = 10_000;
/** Overall upstream budget for one /api/vin request. */
export const VIN_REQUEST_DEADLINE_MS = 15_000;

export interface Deadline {
  /** Aborts when the overall deadline passes. */
  readonly signal: AbortSignal;
  expired(): boolean;
  remainingMs(): number;
}

export function createDeadline(
  ms: number = VIN_REQUEST_DEADLINE_MS,
  now: () => number = Date.now,
): Deadline {
  const end = now() + ms;
  const signal = AbortSignal.timeout(Math.max(1, ms));
  return {
    signal,
    expired: () => signal.aborted || now() >= end,
    remainingMs: () => Math.max(0, end - now()),
  };
}

/**
 * Signal for one upstream call: aborts at the per-call timeout or the request deadline, whichever
 * comes first. Without a deadline, the per-call timeout still applies.
 */
export function callSignal(
  deadline?: Deadline,
  perCallMs: number = UPSTREAM_CALL_TIMEOUT_MS,
): AbortSignal {
  const per = AbortSignal.timeout(
    Math.max(
      1,
      Math.min(perCallMs, deadline ? deadline.remainingMs() || 1 : perCallMs),
    ),
  );
  return deadline ? AbortSignal.any([per, deadline.signal]) : per;
}

export interface UpstreamOpts {
  deadline?: Deadline;
}

/** Max upstream response body we will buffer (NHTSA, EPA, mcp.vin). Real bodies are a few KB. */
export const UPSTREAM_MAX_BYTES = 1024 * 1024;

type BodyLike = {
  json?: () => Promise<any>;
  text?: () => Promise<string>;
  body?: unknown;
  headers?: { get?: (name: string) => string | null } | null;
};

/**
 * Parse an upstream JSON body, refusing anything past maxBytes: Content-Length first, then a counted
 * stream read that is cancelled as soon as it passes the cap (nothing past the cap is buffered).
 * Throws on oversize, so callers' existing failure paths apply. A real Response without a body
 * stream is an error (no uncapped text()/json() read). Only plain test doubles (not a Response)
 * fall back to their json().
 */
export async function readJsonCapped(
  res: BodyLike,
  maxBytes: number = UPSTREAM_MAX_BYTES,
): Promise<any> {
  const declared = Number(res.headers?.get?.("content-length") || 0);
  if (declared > maxBytes)
    throw new Error(`upstream body ${declared} > ${maxBytes}`);
  const body = res.body as ReadableStream<Uint8Array> | null | undefined;
  if (body && typeof (body as any).getReader === "function") {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`upstream body > ${maxBytes}`);
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(buf));
  }
  if (typeof Response !== "undefined" && res instanceof Response)
    throw new Error("upstream response has no body");
  if (typeof res.json === "function") return res.json(); // test doubles only
  throw new Error("upstream response has no body");
}
