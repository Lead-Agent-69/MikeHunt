import { NextRequest, NextResponse } from "next/server";
import { bearerMatches } from "@/lib/auth/bearer";
import { getServerUser } from "@/lib/server-supabase";
import { isAdminEmail, isAdminConfigured } from "@/lib/auth/admin";

// /api/admin/system — health endpoint.
//
// Two tiers, deliberately:
//   * PUBLIC: `status` + `timestamp`. Uptime monitors (Datadog, Pingdom, Vercel cron probes) only
//     need to know the process is alive, and gating the whole response would page someone on every
//     check.
//   * ADMIN: `uptime`, `memory`, `adminConfigured`. Process internals describe the host and the
//     deployment's auth posture — reconnaissance value for an attacker, none for a monitor.
//
// Authorization accepts either the machine path (Bearer INGEST_SECRET, for CI/cron/monitoring that
// has no user session) or a signed-in admin session.

export const dynamic = "force-dynamic";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.INGEST_SECRET;
  const header = req.headers.get("authorization");
  if (secret && bearerMatches(header, secret)) return true;

  try {
    const {
      data: { user },
    } = await getServerUser();
    return isAdminEmail(user?.email);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const authorized = await isAuthorized(req);

    const body: Record<string, unknown> = {
      status: "ok",
      timestamp: new Date().toISOString(),
    };

    if (authorized) {
      body.uptime = process.uptime();
      body.memory = process.memoryUsage();
      body.node = process.version;
      body.adminConfigured = isAdminConfigured();
    }

    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", error: message },
      { status: 500 },
    );
  }
}
