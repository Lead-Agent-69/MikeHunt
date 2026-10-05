// app/api/scrape/queue/route.ts
// Queue management API: enqueue, clear, and inspect jobs.

import { NextRequest, NextResponse } from "next/server";
import { createScraperRegistry } from "@/lib/scrapers/runner";
import { QueueOrchestrator } from "@/lib/scrapers/orchestrators/queue";
import { denyUnauthed } from "@/lib/auth/scrape-gate";

export const dynamic = "force-dynamic";

// P0: previously unauthenticated on GET/POST/DELETE/PATCH.
//
// Beyond the obvious (drain the queue, retry dead-letter jobs, forge jobs), this route took
// `redisUrl` from the query string or body and handed it straight to Bull — so an anonymous caller
// could make the server connect to an attacker-controlled Redis (SSRF / job exfiltration).
//
// Two fixes: the shared-secret gate, and DROPPING client-supplied `redisUrl` entirely. The queue
// name stays caller-settable (it only selects a key prefix); the endpoint now always uses
// process.env.REDIS_URL, which only someone with deploy access can change.

/** Queue connection always comes from the environment, never from the request. */
function resolveRedisUrl(): string | undefined {
  return process.env.REDIS_URL || undefined;
}

export async function GET(request: NextRequest) {
  const denied = await denyUnauthed(request);
  if (denied) return denied;
  try {
    const searchParams = request.nextUrl.searchParams;
    const queueName =
      searchParams.get("queueName") ||
      process.env.SCRAPER_QUEUE_NAME ||
      undefined;
    const redisUrl = resolveRedisUrl();

    const registry = createScraperRegistry();
    const orchestrator = new QueueOrchestrator(registry, {
      queueName,
      redisUrl,
    });

    const pending = await orchestrator.getQueueLength();
    const jobs = await orchestrator.getJobStatuses(100);

    await orchestrator.stop();

    return NextResponse.json({
      queueName: orchestrator.getQueueName(),
      pending,
      jobs,
    });
  } catch (error) {
    console.error("Queue GET failed:", error);
    return NextResponse.json(
      { error: "Queue GET failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyUnauthed(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const queueName =
      body.queueName || process.env.SCRAPER_QUEUE_NAME || undefined;
    const redisUrl = resolveRedisUrl();
    const sourceIds: string[] | undefined = body.sourceIds;

    const registry = createScraperRegistry();
    const orchestrator = new QueueOrchestrator(registry, {
      queueName,
      redisUrl,
    });

    const enqueued = await orchestrator.enqueue(sourceIds);
    await orchestrator.stop();

    return NextResponse.json({
      enqueued,
      queueName: orchestrator.getQueueName(),
    });
  } catch (error) {
    console.error("Queue POST failed:", error);
    return NextResponse.json(
      { error: "Queue POST failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await denyUnauthed(request);
  if (denied) return denied;
  try {
    const searchParams = request.nextUrl.searchParams;
    const queueName =
      searchParams.get("queueName") ||
      process.env.SCRAPER_QUEUE_NAME ||
      undefined;
    const redisUrl = resolveRedisUrl();

    const registry = createScraperRegistry();
    const orchestrator = new QueueOrchestrator(registry, {
      queueName,
      redisUrl,
    });
    await orchestrator.clearQueue();
    await orchestrator.stop();

    return NextResponse.json({
      cleared: true,
      queueName: orchestrator.getQueueName(),
    });
  } catch (error) {
    console.error("Queue DELETE failed:", error);
    return NextResponse.json(
      { error: "Queue DELETE failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await denyUnauthed(request);
  if (denied) return denied;
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action") || "retry";
    const queueName =
      searchParams.get("queueName") ||
      process.env.SCRAPER_QUEUE_NAME ||
      undefined;
    const redisUrl = resolveRedisUrl();
    const body = await request.json().catch(() => ({}));
    const limit = body.limit ? parseInt(body.limit, 10) : 10;

    const registry = createScraperRegistry();
    const orchestrator = new QueueOrchestrator(registry, {
      queueName,
      redisUrl,
    });

    if (action === "retry") {
      const requeued = await orchestrator.retryDeadLetter(limit);
      await orchestrator.stop();
      return NextResponse.json({ requeued });
    }

    if (action === "clear-dlq") {
      await orchestrator.clearDeadLetterQueue();
      await orchestrator.stop();
      return NextResponse.json({
        cleared: true,
        dlq: orchestrator.getDeadLetterQueueName(),
      });
    }

    if (action === "deadletter") {
      const jobs = await orchestrator.getDeadLetterJobs(limit);
      await orchestrator.stop();
      return NextResponse.json({
        dlq: orchestrator.getDeadLetterQueueName(),
        jobs,
      });
    }

    await orchestrator.stop();
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Queue PATCH failed:", error);
    return NextResponse.json(
      { error: "Queue PATCH failed" },
      { status: 500 },
    );
  }
}
