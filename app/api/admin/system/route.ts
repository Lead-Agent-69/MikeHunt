import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-supabase";

// /api/admin/system
// System health check for uptime monitoring

export async function GET() {
  try {
    const {
      data: { user },
    } = await getServerUser();

    // In a real app, you might restrict this to admin users only.
    // However, basic health checks are often public for monitoring services (e.g., Datadog, Pingdom).
    // So we just return the basic health status.

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", error: error.message },
      { status: 500 },
    );
  }
}
