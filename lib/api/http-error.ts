import { NextResponse } from "next/server";

/**
 * Log the real error server-side and return a generic 500. Never put DB or
 * upstream `.message` strings in the response body.
 */
export function internalError(
  label: string,
  err: unknown,
  publicMessage = "Something went wrong",
  status = 500,
  extra: Record<string, unknown> = {},
) {
  const detail = err instanceof Error ? err.message : err;
  console.error(`[${label}]`, detail);
  return NextResponse.json({ error: publicMessage, ...extra }, { status });
}
