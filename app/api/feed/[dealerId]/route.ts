import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dealerId: string }> },
) {
  const { dealerId } = await params;
  let userId = "";
  try {
    const {
      data: { user },
    } = await getServerUser();
    userId = user?.id ? String(user.id) : "";
  } catch {
    userId = "";
  }
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (userId !== dealerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServerComponentClient();

  try {
    const { data: inventory, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("dealer_id", dealerId)
      .eq("stage", "listed")
      .limit(50);

    if (error) {
      console.error("[feed] inventory read failed", error);
      return NextResponse.json(
        { error: "Could not load inventory" },
        { status: 500 },
      );
    }

    const vehicles = (inventory || []).map((item) => ({
      id: item.id,
      vin: item.vin,
      year: item.year,
      make: item.make,
      model: item.model,
      trim: item.trim,
      price: Math.round(item.list_price || item.market_value || 0),
      mileage: item.odometer,
      condition: item.condition,
      image_url: item.photos?.[0],
    }));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<inventory>
  <dealer>
    <id>${xmlEscape(dealerId)}</id>
    <name>MikeHunt Dealer</name>
  </dealer>
  <vehicles>
    ${vehicles
      .map(
        (v) => `
    <vehicle>
      <id>${xmlEscape(v.id)}</id>
      <vin>${xmlEscape(v.vin)}</vin>
      <year>${xmlEscape(v.year)}</year>
      <make>${xmlEscape(v.make)}</make>
      <model>${xmlEscape(v.model)}</model>
      <trim>${xmlEscape(v.trim || "")}</trim>
      <price>${xmlEscape(v.price)}</price>
      <mileage>${xmlEscape(v.mileage || "")}</mileage>
      <condition>${xmlEscape(v.condition)}</condition>
      <image_url>${xmlEscape(v.image_url || "")}</image_url>
    </vehicle>`,
      )
      .join("")}
  </vehicles>
</inventory>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[feed] inventory failed", err);
    return NextResponse.json(
      { error: "Could not load inventory" },
      { status: 500 },
    );
  }
}
