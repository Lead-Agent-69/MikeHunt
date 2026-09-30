// app/api/scrape/credentials/route.ts
// Manage encrypted scraper credentials for auth-required sources.

import { NextRequest, NextResponse } from "next/server";
import { ScraperCredentialManager } from "@/lib/scrapers/tools/credentials";
import { denyUnauthed } from "@/lib/auth/scrape-gate";

export const dynamic = "force-dynamic";

// P0: this route previously had NO auth on any verb. It reads, writes and deletes the encrypted
// credentials for auth-required sources, so anyone who found the URL could exfiltrate or wipe them.
// Bearer secret only — there is no UI for it, so there is nothing to loosen it for.

function getManager() {
  return new ScraperCredentialManager();
}

export async function GET(request: NextRequest) {
  const denied = await denyUnauthed(request);
  if (denied) return denied;
  try {
    const sourceId = request.nextUrl.searchParams.get("sourceId");
    if (!sourceId) {
      return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
    }

    const manager = getManager();
    const credentials = await manager.getCredentials(sourceId);

    if (!credentials) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    // Mask sensitive fields in API response
    const masked = Object.fromEntries(
      Object.entries(credentials).map(([key, value]) => {
        if (
          [
            "password",
            "apiSecret",
            "token",
            "refreshToken",
            "cookies",
            "sessionStorage",
          ].includes(key)
        ) {
          return [key, value ? "***" : value];
        }
        return [key, value];
      }),
    );

    return NextResponse.json({ found: true, credentials: masked });
  } catch (error) {
    console.error("[API/Credentials] GET failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Credential GET failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyUnauthed(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const { sourceId, ...credentials } = body;

    if (!sourceId) {
      return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
    }

    const manager = getManager();
    await manager.setCredentials(sourceId, credentials);

    return NextResponse.json({ success: true, sourceId });
  } catch (error) {
    console.error("[API/Credentials] POST failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Credential POST failed",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await denyUnauthed(request);
  if (denied) return denied;
  try {
    const sourceId = request.nextUrl.searchParams.get("sourceId");
    if (!sourceId) {
      return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
    }

    const manager = getManager();
    await manager.deleteCredentials(sourceId);

    return NextResponse.json({ success: true, sourceId });
  } catch (error) {
    console.error("[API/Credentials] DELETE failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Credential DELETE failed",
      },
      { status: 500 },
    );
  }
}
