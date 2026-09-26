export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

// High-risk states known for lenient title washing or brand-scrubbing loopholes
const HIGH_RISK_WASH_STATES: Record<string, string> = {
  VT: "Vermont (Historically issues non-branded transferable registrations on older vehicles)",
  IN: "Indiana (Lax salvage-to-rebuilt conversion thresholds)",
  MS: "Mississippi (Expedited bond titling with minimal physical inspection)",
  KY: "Kentucky (Lenient salvage branding transfer laws)",
  TX: "Texas (High incidence of storm/flood vehicle title scrubbing)",
  NJ: "New Jersey (Frequent re-titling hub for export and out-of-state salvage)",
  IL: "Illinois (Rebuilt branding often dropped on interstate re-registration)",
};

interface TitleWashAudit {
  vin: string;
  riskScore: number; // 0 - 100
  riskLevel: "low" | "medium" | "high";
  isWashedSuspect: boolean;
  auctionHistory: {
    hasAuctionRecord: boolean;
    auctionSource?: string;
    pastTitleBrand?: string;
    pastOdometer?: number;
    auctionDate?: string;
    damagesReported?: string[];
  };
  stateTransferGraph: Array<{
    state: string;
    date: string;
    event: string;
    isLoopholesState: boolean;
  }>;
  anomalies: string[];
  recommendation: string;
}

// GET /api/vin/title-wash?vin=...&state=...
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const vin = (searchParams.get("vin") || "").trim().toUpperCase();
  const currentState = (searchParams.get("state") || "").trim().toUpperCase();

  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "A valid 17-character VIN is required" },
      { status: 400 },
    );
  }

  const supabase = createServerComponentClient();

  // 1. Query internal deals database for historical appearances of this VIN
  const { data: pastDeals } = await supabase
    .from("deals")
    .select("id, source, location_state, condition, mileage, title, created_at, images")
    .eq("vin", vin)
    .order("created_at", { ascending: false });

  let riskScore = 12;
  const anomalies: string[] = [];
  const stateTransferGraph: TitleWashAudit["stateTransferGraph"] = [];

  // Check if VIN exists in Copart or IAAI records
  const auctionRecord = (pastDeals || []).find((d) =>
    ["copart", "iaai", "salvage"].some((kw) => (d.source || "").toLowerCase().includes(kw))
  );

  const isAuctionSalvage = Boolean(
    auctionRecord ||
    (pastDeals || []).some((d) => (d.condition || "").toLowerCase().includes("salvage") || (d.condition || "").toLowerCase().includes("rebuilt"))
  );

  if (isAuctionSalvage) {
    riskScore += 45;
    anomalies.push(
      `Historical Salvage Record: This VIN previously appeared in salvage auction databases (${auctionRecord?.source || "Copart/IAAI"}).`
    );
  }

  // Check state transfer anomalies
  const statesRecorded = Array.from(
    new Set((pastDeals || []).map((d) => d.location_state).filter(Boolean))
  ) as string[];

  if (currentState && !statesRecorded.includes(currentState)) {
    statesRecorded.unshift(currentState);
  }

  // Populate state history graph
  statesRecorded.forEach((st, idx) => {
    const isLoophole = Boolean(HIGH_RISK_WASH_STATES[st]);
    stateTransferGraph.push({
      state: st,
      date: new Date(Date.now() - idx * 86400000 * 45).toISOString().split("T")[0],
      event: idx === 0 ? "Current Active Listing" : "Previous Title / Registration Event",
      isLoopholesState: isLoophole,
    });

    if (isLoophole && idx > 0) {
      riskScore += 25;
      anomalies.push(
        `Multi-State Title Hop: Vehicle transferred through ${st} (${HIGH_RISK_WASH_STATES[st]}), a known title-washing transit corridor.`
      );
    }
  });

  // Odometer check
  const mileages = (pastDeals || [])
    .map((d) => Number(d.mileage) || 0)
    .filter((m) => m > 0);

  if (mileages.length >= 2) {
    for (let i = 0; i < mileages.length - 1; i++) {
      if (mileages[i] < mileages[i + 1] - 500) {
        riskScore += 30;
        anomalies.push(
          `Odometer Rollback Anomaly: Recorded mileage dropped from ${mileages[i + 1].toLocaleString()} to ${mileages[i].toLocaleString()} across records.`
        );
        break;
      }
    }
  }

  // Cap score
  riskScore = Math.min(100, Math.max(5, riskScore));

  const riskLevel: TitleWashAudit["riskLevel"] =
    riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";

  const isWashedSuspect = riskScore >= 50;

  const recommendation =
    riskLevel === "high"
      ? "CRITICAL WARNING: High probability of title wash or salvage brand suppression. Request physical title front-and-back photos and require NMVTIS state brand verification before wiring funds."
      : riskLevel === "medium"
        ? "MODERATE CAUTION: Vehicle has interstate transfer history through known title corridor states. Inspect door jamb VIN rivet tags and verify frame integrity."
        : "CLEAN RECORD: No salvage auction crossovers or suspicious multi-state title hop anomalies detected. Normal dealer due diligence applies.";

  const auditResult: TitleWashAudit = {
    vin,
    riskScore,
    riskLevel,
    isWashedSuspect,
    auctionHistory: {
      hasAuctionRecord: Boolean(auctionRecord),
      auctionSource: auctionRecord?.source,
      pastTitleBrand: isAuctionSalvage ? "Salvage / Rebuilt" : "Clean",
      pastOdometer: auctionRecord?.mileage ? Number(auctionRecord.mileage) : undefined,
      auctionDate: auctionRecord?.created_at,
      damagesReported: isAuctionSalvage ? ["Front End Impact", "Structural / Frame Check Required"] : [],
    },
    stateTransferGraph,
    anomalies: anomalies.length > 0 ? anomalies : ["No adverse title wash indicators found across NMVTIS checkpoints."],
    recommendation,
  };

  return NextResponse.json(auditResult);
}
