import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

const parserSchema = z.object({
  make: z.string().optional().describe("Vehicle make, e.g. Ford"),
  model: z.string().optional().describe("Vehicle model, e.g. F-150"),
  minYear: z.string().optional().describe("Minimum year, e.g. 2010"),
  maxPrice: z.string().optional().describe("Max price, e.g. 15000"),
  state: z.string().optional().describe("2-letter US state code, e.g. TX"),
});

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "parse", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json({});

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: parserSchema,
      prompt: `Parse this natural language vehicle search query into structured filters. Ignore parts that don't match our schema.
      
Query: "${q}"`,
    });

    return NextResponse.json(object);
  } catch (err) {
    console.error("Parse error:", err);
    return NextResponse.json({});
  }
}
