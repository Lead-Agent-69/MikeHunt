export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { hashApiKey } from "@/lib/api-keys";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { applyBuyableInventory } from "@/lib/search/customer-inventory";
import {
  RECOMMENDATION_FIELDS,
  recommendationEvidence,
  recommendationText,
} from "@/lib/deals/recommendation-evidence";
import {
  readSavedBuyerMode,
  isFlipDeskMode,
} from "@/lib/deals/deal-desk-access";
import {
  exactVehicleModel,
  modelVariants,
} from "@/lib/market/comparison-sample";
import { titleCaseMake } from "@/lib/vehicle/canonical";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "private, no-store",
};
const TOOLS = [
  {
    name: "search_deals",
    description:
      "Search current vehicle observations. Recommendations and economics require verified purchase evidence. Use verdict all to include research listings; default go returns verified buy candidates only.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string" },
        make: { type: "string" },
        model: { type: "string" },
        min_profit: { type: "number" },
        verdict: { type: "string", enum: ["go", "hold", "pass", "all"] },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "market_pulse",
    description:
      "A bounded current inventory sample with source-backed evidence status. Stored GO scores are not verified opportunities.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_next_best_buy",
    description:
      "Find an evidence-backed resale candidate within a reported cash-price budget. Unknown purchase checks withhold recommendations; turnover is not inferred.",
    inputSchema: {
      type: "object",
      properties: {
        capital: { type: "number", minimum: 0 },
        state: { type: "string" },
        strategy: {
          type: "string",
          enum: ["max_roi", "fastest_flip", "max_profit"],
        },
      },
    },
  },
];

function validArgs(args: any) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return false;
  return (
    (args.state === undefined || /^[A-Z]{2}$/i.test(args.state)) &&
    [args.make, args.model].every(
      (v) =>
        v === undefined ||
        (typeof v === "string" &&
          new RegExp("^[\\p{L}\\p{N} .'-]{1,60}$", "u").test(v)),
    ) &&
    [args.capital, args.min_profit].every(
      (v) =>
        v === undefined ||
        (typeof v === "number" && Number.isFinite(v) && v >= 0),
    ) &&
    (args.limit === undefined ||
      (Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= 50)) &&
    (args.verdict === undefined ||
      ["go", "hold", "pass", "all"].includes(args.verdict)) &&
    (args.strategy === undefined ||
      ["max_roi", "fastest_flip", "max_profit"].includes(args.strategy))
  );
}

async function runTool(db: any, ownerId: string, name: string, args: any) {
  const allowEconomics = isFlipDeskMode(await readSavedBuyerMode(db, ownerId));
  if (name === "get_next_best_buy" && !allowEconomics)
    return "Resale recommendations require your saved resale buying preferences. No profit or purchase ceiling is established.";
  if (name === "get_next_best_buy" && args.strategy === "fastest_flip")
    return "Turnover evidence is not established. A fastest-flip recommendation cannot be made from asking prices or modeled profit.";
  let query = applyBuyableInventory(
    db.from("deals").select(RECOMMENDATION_FIELDS, { count: "exact" }),
  )
    .order("last_seen_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(800);
  if (args.state) query = query.eq("location_state", args.state.toUpperCase());
  if (args.make) query = query.ilike("make", titleCaseMake(args.make));
  if (args.model)
    query = query.or(
      modelVariants(args.model)
        .map((v) => `model.ilike."${v}"`)
        .join(","),
    );
  const { data, error, count } = await query.abortSignal(
    AbortSignal.timeout(10000),
  );
  if (error || !Array.isArray(data)) throw new Error("unavailable");
  let rows = data.filter(
    (row: any) =>
      !args.model || exactVehicleModel(row, args.make || row.make, args.model),
  );
  const sample = `Sampled ${data.length} current observations${count == null ? "; full count unavailable" : count > data.length ? ` of ${count}; results are limited to this sample` : ""}.`;
  if (name === "market_pulse") {
    const ready = rows.filter((row: any) => recommendationEvidence(row).ready);
    return `${sample} ${ready.length} meet the existing purchase-evidence gates. ${rows.length - ready.length} need further evidence. Asking observations are not completed sales.\n${rows
      .slice(0, 5)
      .map((row: any) => recommendationText(row, allowEconomics))
      .join("\n")}`;
  }
  if (name === "get_next_best_buy") {
    rows = rows.filter((row: any) => {
      const e = recommendationEvidence(row);
      return (
        e.ready &&
        e.profit! > 0 &&
        (!args.capital || e.price.cashPrice! <= args.capital)
      );
    });
    rows.sort((a: any, b: any) =>
      args.strategy === "max_profit"
        ? b.true_net_profit - a.true_net_profit
        : b.true_net_profit / recommendationEvidence(b).price.cashPrice! -
          a.true_net_profit / recommendationEvidence(a).price.cashPrice!,
    );
    return rows.length
      ? `${sample} Evidence-backed candidate, not purchase approval. Cash-price budget excludes additional costs.\n${recommendationText(rows[0], true)}`
      : `${sample} No verified buy candidate in this sample. Confirm price meaning, title, inspection, costs and dated comparable sold evidence before setting a purchase ceiling.`;
  }
  const verdict = args.verdict || "go";
  rows = rows.filter((row: any) => {
    const e = recommendationEvidence(row);
    if (verdict === "go" && (!allowEconomics || !e.ready)) return false;
    if (["hold", "pass"].includes(verdict) && row.deal_verdict !== verdict)
      return false;
    return (
      args.min_profit === undefined ||
      (allowEconomics && e.ready && e.profit! >= args.min_profit)
    );
  });
  return rows.length
    ? `${sample}\n${rows
        .slice(0, args.limit || 10)
        .map((row: any) => recommendationText(row, allowEconomics))
        .join("\n")}`
    : `${sample} No matching verified candidates. Use verdict all for research observations; unverified profit and purchase ceilings remain withheld.`;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "mcp", limit: 120, windowMs: 60000 });
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
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string")
    return fail(-32600, "Invalid request");
  if (msg.method === "initialize")
    return reply({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "dealerhunt", version: "1.0.0" },
    });
  if (msg.method === "notifications/initialized")
    return new NextResponse(null, { status: 204, headers: CORS });
  if (msg.method === "tools/list") return reply({ tools: TOOLS });
  if (msg.method !== "tools/call") return fail(-32601, "Method not found");
  const name = msg.params?.name;
  const args = msg.params?.arguments ?? {};
  if (!TOOLS.some((t) => t.name === name) || !validArgs(args))
    return fail(-32602, "Choose a supported tool and valid search parameters.");
  try {
    const key = req.headers.get("x-api-key");
    if (!key || key.length > 256)
      return reply({
        content: [{ type: "text", text: "Supply a valid API key." }],
        isError: true,
      });
    const db = createServerComponentClient();
    const { data: identity, error } = await db
      .from("api_keys")
      .select("id,user_id,revoked")
      .eq("key_hash", hashApiKey(key))
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle();
    if (error || !identity?.user_id || identity.revoked !== false)
      return reply({
        content: [
          { type: "text", text: "This API key is unavailable or revoked." },
        ],
        isError: true,
      });
    const text = await runTool(db, identity.user_id, name, args);
    return reply({ content: [{ type: "text", text }] });
  } catch {
    return reply({
      content: [
        {
          type: "text",
          text: "Vehicle research is temporarily unavailable. No recommendation was produced; try again.",
        },
      ],
      isError: true,
    });
  }
}
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
