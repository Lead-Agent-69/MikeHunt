export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { hashApiKey } from "@/lib/api-keys";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// /api/mcp — Model Context Protocol server (JSON-RPC 2.0 over HTTP). Lets AI assistants (Claude,
// etc.) query the dealer market in natural language and get back PROFIT intelligence — GO verdicts,
// net profit, max bid — which no other car-data MCP exposes. Auth: x-api-key (mint at /developer).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOOLS = [
  {
    name: "search_deals",
    description:
      "Search active vehicle deals with profit intelligence. Returns GO/HOLD/PASS verdicts, estimated net profit (after transport/recon/fees), and a recommended max bid.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", description: "US state code, e.g. TX" },
        make: { type: "string", description: "Vehicle make, e.g. Ford" },
        model: { type: "string", description: "Vehicle model, e.g. F-150" },
        min_profit: {
          type: "number",
          description: "Minimum estimated net profit in dollars",
        },
        verdict: {
          type: "string",
          enum: ["go", "hold", "pass", "all"],
          description: "Engine verdict filter (default go)",
        },
        limit: {
          type: "number",
          description: "Max results, 1-50 (default 10)",
        },
      },
    },
  },
  {
    name: "market_pulse",
    description:
      "The make/models with the most live GO deals right now, with average net profit and days-on-market.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function authed(req: NextRequest): Promise<boolean> {
  const key = req.headers.get("x-api-key") || "";
  if (!key) return false;
  const supabase = createServerComponentClient();
  const { data } = await supabase
    .from("api_keys")
    .select("id, revoked, request_count")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();
  if (!data || data.revoked) return false;

  // Best-effort usage tracking, same as the public REST API.
  supabase
    .from("api_keys")
    .update({
      request_count: (data.request_count || 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .then(
      () => {},
      () => {},
    );
  return true;
}

async function runTool(name: string, args: any): Promise<string> {
  const supabase = createServerComponentClient();
  if (name === "search_deals") {
    const verdict = args.verdict || "go";
    const limit = Math.min(50, Math.max(1, Number(args.limit) || 10));
    let q = supabase
      .from("deals")
      .select(
        "year, make, model, ask_price, true_net_profit, recommended_max_bid, deal_verdict, location_state, source",
      )
      .eq("active", true)
      .gt("ask_price", 0)
      .order("profit_score", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (verdict !== "all") q = q.eq("deal_verdict", verdict);
    if (args.state)
      q = q.eq("location_state", String(args.state).toUpperCase());
    if (args.make) q = q.ilike("make", args.make);
    if (args.model)
      q = q.ilike("model", `%${String(args.model).split(" ")[0]}%`);
    if (args.min_profit) q = q.gte("true_net_profit", Number(args.min_profit));
    const { data } = await q;
    if (!data?.length) return "No matching deals found.";
    return data
      .map(
        (d: any) =>
          `${d.year} ${d.make} ${d.model} — $${Number(d.ask_price).toLocaleString()} [${(d.deal_verdict || "").toUpperCase()}] · ~$${Math.round(Number(d.true_net_profit) || 0).toLocaleString()} profit · max bid $${Math.round(Number(d.recommended_max_bid) || 0).toLocaleString()} · ${d.location_state || "?"} (${d.source})`,
      )
      .join("\n");
  }
  if (name === "market_pulse") {
    const { data } = await supabase.rpc("get_market_pulse");
    if (!data?.length) return "No market data yet.";
    return data
      .map(
        (r: any) =>
          `${r.make} ${r.model}: ${r.go_deals} GO deals · ~$${Math.round(Number(r.avg_profit) || 0).toLocaleString()} avg profit · ${r.avg_days}d on market`,
      )
      .join("\n");
  }
  return `Unknown tool: ${name}`;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "mcp", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  let msg: any;
  try {
    msg = await req.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      { headers: CORS },
    );
  }

  const id = msg?.id ?? null;
  const reply = (result: any) =>
    NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: CORS });
  const fail = (code: number, message: string) =>
    NextResponse.json(
      { jsonrpc: "2.0", id, error: { code, message } },
      { headers: CORS },
    );

  switch (msg?.method) {
    case "initialize":
      return reply({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "dealerhunt-pro", version: "1.0.0" },
      });
    case "notifications/initialized":
      return new NextResponse(null, { status: 204, headers: CORS });
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      if (!(await authed(req))) {
        return reply({
          content: [
            {
              type: "text",
              text: "Unauthorized — supply a valid x-api-key (mint one at /developer).",
            },
          ],
          isError: true,
        });
      }
      const name = msg?.params?.name;
      const args = msg?.params?.arguments || {};
      if (!TOOLS.some((t) => t.name === name))
        return fail(-32602, `Unknown tool: ${name}`);
      try {
        const text = await runTool(name, args);
        return reply({ content: [{ type: "text", text }] });
      } catch (e: any) {
        return reply({
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg?.method}`);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
