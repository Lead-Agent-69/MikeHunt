import { load } from "cheerio";
import { extractVin, normalizeVin } from "@/lib/vehicle/vin";

/** Read only the VIN-matched primary identity and buybox, never related vehicles. */
export function dealerVdpObservation(
  html: string,
  sourceUrl: string,
  expectedVin?: string | null,
) {
  const $ = load(html);
  const identity = $(".vdp-identity-main");
  const expected = extractVin(expectedVin || "") || extractVin(sourceUrl);
  if (identity.length !== 1 || !expected) return null;
  const fields = new Map<string, string>();
  identity.find("dt").each((_, node) => {
    const label = $(node).text().trim().toLowerCase();
    if (fields.has(label)) fields.set(label, "");
    else fields.set(label, $(node).next("dd").text().trim());
  });
  if (normalizeVin(fields.get("vin") || "") !== expected) return null;
  const location = fields
    .get("location")
    ?.split("·")
    .pop()
    ?.trim()
    .match(/^([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  const box = $("aside.vdp-side .vdp-buybox");
  const final = box.find(".ps-final");
  const label = final
    .find(".ps-final-label")
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const amount = final.find(".ps-now").clone();
  amount.find(".vcard-override").remove();
  const raw = amount.text().replace(/\s+/g, " ").trim();
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const sameTitle =
    normalize(identity.find("h1").text()) ===
      normalize(box.find(".vdp-title").text()) &&
    Boolean(identity.find("h1").text().trim());
  const advertisedFinal =
    sameTitle &&
    box.length === 1 &&
    final.length === 1 &&
    /^final price$/i.test(label) &&
    /^\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?$/.test(raw)
      ? Number(raw.replace(/[$,]/g, ""))
      : undefined;
  return {
    vin: expected,
    location: location
      ? {
          location_city: location[1].trim(),
          location_state: location[2],
          location_zip: location[3],
        }
      : undefined,
    advertisedFinal:
      advertisedFinal != null &&
      advertisedFinal >= 100 &&
      advertisedFinal < 2_000_000
        ? advertisedFinal
        : undefined,
  };
}
