export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createServerComponentClient } from "@/lib/supabase";
import * as cheerio from "cheerio";
import { fetchWithPatchright } from "@/lib/scrapers/tools/patchright-engine";
import { getTextModel, hasTextModel } from "@/lib/ai/text-model";
import { getServerUser } from "@/lib/server-supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// POST /api/deal-check  { image: <data URL> }
// Photograph an auction run sheet / wholesaler offer OR paste a URL/text → model extracts the line items
// (price, fees, add-ons, taxes, OTD, red flags) → compared to our market. Uses the existing
// OpenAI/Google model. Auth + rate-limited; an explicit, cost-aware action.
const PROMPT = `Extract every financial detail from this vehicle deal sheet / buyer's order / auction run sheet. Return ONLY JSON (no prose), with this shape:
{
  "vehicle": { "year": number|null, "make": string|null, "model": string|null, "vin": string|null, "mileage": number|null },
  "selling_price": number|null,
  "fees": [{ "name": string, "amount": number }],
  "addons": [{ "name": string, "amount": number }],
  "taxes": number|null,
  "total_out_the_door": number|null,
  "red_flags": [string]
}
Extract ONLY what is literally on the document — do not invent numbers. In red_flags, note junk/hidden fees, math that doesn't reconcile, or padded add-ons.`;

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "deal-check", limit: 15, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json(
      { error: "Sign in to use Deal Check." },
      { status: 401 },
    );
  if (!hasTextModel())
    return NextResponse.json(
      { error: "No AI provider key configured." },
      { status: 503 },
    );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const image: string | undefined = body.image;
  const inputText: string | undefined = body.text;

  if (!image && !inputText)
    return NextResponse.json(
      { error: "Image or text required" },
      { status: 400 },
    );

  let contentText = inputText;
  if (
    inputText &&
    (inputText.startsWith("http://") || inputText.startsWith("https://"))
  ) {
    try {
      // Use stealth browser to bypass Cloudflare/bot-protection on Copart/IAA etc.
      const html = await fetchWithPatchright(inputText);
      const $ = cheerio.load(html);
      $("script, style, noscript, img, svg").remove();
      contentText = $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40000); // cap size
    } catch (e) {
      return NextResponse.json(
        {
          error:
            "Could not read the provided URL. The site might be heavily protected.",
        },
        { status: 422 },
      );
    }
  }

  const messagesContent: any[] = [{ type: "text", text: PROMPT }];
  if (contentText) {
    messagesContent.push({
      type: "text",
      text: `Document Text:\n${contentText}`,
    });
  }
  if (image) {
    messagesContent.push({ type: "image", image });
  }

  let extracted: any;
  try {
    const { text } = await generateText({
      model: getTextModel(),
      messages: [
        {
          role: "user",
          content: messagesContent,
        },
      ],
      temperature: 0,
    });
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("no JSON");
    extracted = JSON.parse(text.slice(start, end + 1));
  } catch (e: any) {
    return NextResponse.json(
      { error: "Could not read the document. Try a clearer photo." },
      { status: 422 },
    );
  }

  // Market comparison from our own deals.
  let marketComparison: any = null;
  try {
    const v = extracted.vehicle || {};
    if (v.make && v.model && extracted.selling_price) {
      const supabase = createServerComponentClient();
      let q = supabase
        .from("deals")
        .select("id, year, make, model, mileage, ask_price")
        .eq("active", true)
        .ilike("make", v.make)
        .ilike("model", `%${String(v.model).split(" ")[0]}%`)
        .gt("ask_price", 0)
        .limit(300);
      if (v.year)
        q = q.gte("year", Number(v.year) - 1).lte("year", Number(v.year) + 1);
      const { data } = await q;
      if (data && data.length >= 3) {
        const avg = Math.round(
          data.reduce((s: number, d: any) => s + Number(d.ask_price), 0) /
            data.length,
        );
        const sell = Number(extracted.selling_price);

        // Sort by price proximity to average or just take cheapest ones
        // Let's sort by price ascending to show the best comps
        const sortedComps = [...data].sort(
          (a, b) => Number(a.ask_price) - Number(b.ask_price),
        );
        const topComps = sortedComps.slice(0, 5);

        marketComparison = {
          marketAvg: avg,
          vsMarket: sell - avg,
          isFair: sell <= avg * 1.05,
          sampleSize: data.length,
          comps: topComps,
        };
      }
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ extracted, marketComparison });
}
