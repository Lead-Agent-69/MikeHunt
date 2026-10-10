export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { generateText } from "ai";
import { createServerComponentClient } from "@/lib/supabase";
import * as cheerio from "cheerio";
import { getTextModel, hasTextModel } from "@/lib/ai/text-model";
import { getServerUser } from "@/lib/server-supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { assertPublicHttpUrl, UrlNotAllowedError } from "@/lib/net/public-url";
import { offerSchema } from "@/lib/deal-check/offer-review";

// POST /api/deal-check  { image: <data URL> }
// Photograph an auction run sheet / wholesaler offer OR paste a URL/text → model extracts the line items
// (price, fees, add-ons, taxes, OTD, red flags) → compared to our market. Extraction only: the
// model reads numbers printed on the document, never invents them. Needs ANTHROPIC_API_KEY (no
// OpenAI/Gemini fallback); returns 503 without it. Auth + rate-limited.
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

const URL_IN_TEXT = /\b(?:https?|wss?):\/\/[^\s"'<>)]*/gi;

/** Copy of a browser/import error with every URL replaced, so no user-pasted link reaches Sentry. */
function scrubbedBrowserError(e: unknown): Error {
  const name = e instanceof Error ? e.name : "Error";
  const message = (e instanceof Error ? e.message : String(e))
    .replace(URL_IN_TEXT, "[url]")
    .slice(0, 500);
  const safe = new Error(message);
  safe.name = name;
  if (e instanceof Error && e.stack) {
    safe.stack = e.stack.replace(URL_IN_TEXT, "[url]");
  }
  return safe;
}

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
      { error: "Deal Check needs an AI key and is off on this deployment." },
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
    // SSRF guard: a pasted URL must be public http(s). Never let the server-side browser reach
    // localhost, RFC1918, link-local, or cloud metadata.
    let target: URL;
    try {
      target = await assertPublicHttpUrl(inputText.trim());
    } catch (e) {
      if (e instanceof UrlNotAllowedError) {
        return NextResponse.json(
          {
            error:
              "That URL is not allowed. Paste a public http(s) listing link.",
          },
          { status: 400 },
        );
      }
      throw e;
    }
    try {
      // Headless browser read of the pasted public page. Every redirect hop and
      // sub-request is re-checked; private/metadata hops abort (UrlNotAllowedError).
      // Dynamic import prevents patchright-core module-init from crashing the route
      // at cold-start when the browser binary is unavailable (e.g. image-only requests).
      const { fetchPublicWithPatchright } =
        await import("@/lib/scrapers/tools/patchright-engine");
      const html = await fetchPublicWithPatchright(target.toString());
      const $ = cheerio.load(html);
      $("script, style, noscript, img, svg").remove();
      contentText = $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40000); // cap size
    } catch (e) {
      if (e instanceof UrlNotAllowedError) {
        return NextResponse.json(
          {
            error:
              "That URL is not allowed. Paste a public http(s) listing link.",
          },
          { status: 400 },
        );
      }
      // Fail closed (422 below) but make import/launch/navigation failures visible.
      // Never send the pasted URL: Patchright errors often embed it, so scrub URLs.
      const safeError = scrubbedBrowserError(e);
      console.error("[deal-check] patchright read failed:", safeError.message);
      Sentry.captureException(safeError, {
        tags: { route: "deal-check", stage: "patchright" },
      });
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
    extracted = offerSchema.parse(JSON.parse(text.slice(start, end + 1)));
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
