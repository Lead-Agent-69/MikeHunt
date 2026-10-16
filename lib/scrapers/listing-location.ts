import { load } from "cheerio";
import { US_STATES } from "@/lib/geo";

export interface ListingLocation {
  location_city?: string;
  location_state?: string;
  location_zip?: string;
  lat?: number;
  lng?: number;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
function coordinates(geo: any): Pick<ListingLocation, "lat" | "lng"> {
  const rawLat = geo?.latitude,
    rawLng = geo?.longitude;
  if (rawLat == null || rawLng == null || rawLat === "" || rawLng === "")
    return {};
  const lat = Number(rawLat),
    lng = Number(rawLng);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 18 &&
    lat <= 72 &&
    lng >= -180 &&
    lng <= -60
    ? { lat, lng }
    : {};
}
function address(place: any): ListingLocation {
  const a = place?.address;
  if (!a || typeof a !== "object") return {};
  const country = text(
    a.addressCountry?.name || a.addressCountry,
  ).toUpperCase();
  if (country && !["US", "USA", "UNITED STATES"].includes(country)) return {};
  const state = text(a.addressRegion).toUpperCase();
  if (![...US_STATES, "DC"].includes(state)) return {};
  const city = text(a.addressLocality);
  const zip = text(a.postalCode).match(/^\d{5}(?:-\d{4})?$/)?.[0];
  return {
    ...(city ? { location_city: city } : {}),
    location_state: state,
    ...(zip ? { location_zip: zip } : {}),
    ...coordinates(place.geo),
  };
}
function samePage(raw: unknown, sourceUrl: string): boolean {
  try {
    const u = new URL(text(raw), sourceUrl),
      source = new URL(sourceUrl);
    return (
      Boolean(text(raw)) &&
      u.hostname.replace(/^www\./, "") ===
        source.hostname.replace(/^www\./, "") &&
      u.pathname.replace(/\/$/, "") === source.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

/** Read the current vehicle's location, never a related car or an unrelated dealer branch. */
export function listingLocation(
  html: string,
  sourceUrl: string,
  vin?: string | null,
): ListingLocation {
  const $ = load(html);
  const nodes: any[] = [];
  function collect(value: any) {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      nodes.push(value);
      if (value["@graph"]) collect(value["@graph"]);
    }
  }
  $('script[type="application/ld+json"]').each((_, e) => {
    try {
      collect(JSON.parse($(e).text()));
    } catch {
      /* Broken source JSON is not evidence. */
    }
  });
  const types = (n: any) =>
    Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
  const vehicles = nodes.filter((n) =>
    types(n).some((t: string) =>
      ["Car", "Vehicle", "Product", "Motorcycle"].includes(t),
    ),
  );
  const craigslist =
    /(^|\.)craigslist\.org$/i.test(new URL(sourceUrl).hostname) &&
    $("#postingbody").length > 0;
  const matching = vehicles.filter((n) => {
    const candidateVin = text(
      n.vehicleIdentificationNumber || n.vin,
    ).toUpperCase();
    if (vin && candidateVin) return candidateVin === vin.toUpperCase();
    return (
      samePage(n.url || n["@id"], sourceUrl) ||
      (craigslist && vehicles.length === 1)
    );
  });
  if (matching.length !== 1) return {};
  const vehicle = matching[0];
  const offers = Array.isArray(vehicle.offers)
    ? vehicle.offers
    : [vehicle.offers];
  const places = offers
    .flatMap((o: any) => [o?.availableAtOrFrom, o?.seller, o?.offeredBy])
    .filter(Boolean);
  if (vehicle.seller) places.push(vehicle.seller);
  if (vehicle.location) places.push(vehicle.location);
  const locations = places
    .map(address)
    .filter((a: ListingLocation) => a.location_city || a.location_zip);
  let out: ListingLocation = locations.length === 1 ? locations[0] : {};
  // A single dealer on a VIN-matched detail page can supply its selling address. Multiple branches
  // need an explicit offer-to-location link above; do not choose the first branch.
  if (!locations.length && !craigslist) {
    const dealers = nodes.filter((n) => types(n).includes("AutoDealer"));
    if (dealers.length === 1) out = address(dealers[0]);
  }
  if (craigslist) {
    const statedVin = $(".attr.auto_vin .valu, .attr.auto_vin a")
      .first()
      .text()
      .trim()
      .toUpperCase();
    if (vin && statedVin && statedVin !== vin.toUpperCase()) return {};
    const map = coordinates({
      latitude: $("#map").attr("data-latitude"),
      longitude: $("#map").attr("data-longitude"),
    });
    out = { ...out, ...map };
  }
  return out;
}
