export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { windowStickerUrl } from "@/lib/vehicle/window-sticker";

// GET /api/window-sticker/{vin}?make=Ford
// Proxies the OEM Monroney sticker PDF (free, by VIN) and streams a clean copy — so the browser
// never hits OEM CORS/referer checks, and we filter out the tiny "Error PDF" stubs OEMs return when
// a VIN has no sticker (e.g. Stellantis returns an ~1KB error doc). 404 when unavailable.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ vin: string }> },
) {
  const { vin } = await ctx.params;
  const make = new URL(req.url).searchParams.get("make") || "";
  const url = windowStickerUrl(vin, make);
  if (!url) {
    return NextResponse.json(
      { error: "No window sticker source for this make/VIN." },
      { status: 404 },
    );
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/pdf,*/*" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `OEM returned ${res.status}` },
        { status: 404 },
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "";
    // Reject HTML viewers and the ~1KB "Monroney Error Reporting" stubs OEMs serve for VINs with no
    // sticker (a real sticker PDF is tens to thousands of KB).
    const looksPdf =
      ct.includes("pdf") || buf.subarray(0, 5).toString("latin1") === "%PDF-";
    if (!looksPdf || buf.length < 4000) {
      return NextResponse.json(
        { error: "No sticker available for this VIN." },
        { status: 404 },
      );
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="window-sticker-${vin}.pdf"`,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
