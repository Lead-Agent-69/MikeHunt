import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import { dealerVdpObservation } from "./dealer-vdp-observation";
import { listingLocation } from "./listing-location";
import { dealerDetailPhotos } from "./dealer-detail-photos";
import { dealerDetailPriceEvidence } from "./platforms/dealer-detail";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
const vin = "1FMDE7BH5RLA05037",
  url = `https://www.jarrettforddadecity.com/vehicle-info/used-2024-ford-bronco-big-bend-${vin.toLowerCase()}`;
// Minimal primary DOM observed on the seller's page, excluding forms and unrelated scripts.
const page = `<header>Dade City, FL 33525</header><div class="vdp-identity-main"><h1>2024 Ford Bronco Big Bend</h1><dl><div><dt>VIN</dt><dd>${vin}</dd></div><div><dt>Location</dt><dd>Charlotte County · Port Charlotte, FL 33952</dd></div></dl></div><section class="vdp-gallery"><button data-photo="0"><img src="/front.jpg"></button><button data-photo="1"><img src="/rear.jpg"></button><img src="/logo.png"></section><aside class="vdp-side"><div class="vdp-buybox"><p class="vdp-title">2024 Ford Bronco Big Bend</p><div class="ps-row">Suggested Retail $41,200</div><div class="ps-row">Dealer Fee +$799</div><div class="ps-row">Electronic Filing Fee +$189.50</div><div class="ps-row">You Save -$4,700</div><div class="ps-final"><span class="ps-final-label">Final Price</span><span class="ps-now">$37,488.50<span class="vcard-override"></span></span></div></div></aside><section aria-label="Similar vehicles"><img src="/unrelated.jpg"><div class="ps-final">Final Price $2,180</div></section>`;

describe("VIN-matched dealer primary detail", () => {
  it("reads the vehicle location rather than the website branch address", () => {
    expect(
      listingLocation(page, url, vin, { allowDealerFallback: false }),
    ).toEqual({
      location_city: "Port Charlotte",
      location_state: "FL",
      location_zip: "33952",
    });
  });
  it("keeps final advertised amount separate from retail, savings, fees and verified cash", () => {
    expect(dealerVdpObservation(page, url, vin)?.advertisedFinal).toBe(37488.5);
    const evidence = dealerDetailPriceEvidence(
      load(page),
      { vin, source_url: url, ask_price: 38139 },
      {},
      "2026-11-02T16:00:00Z",
    );
    expect(evidence).toMatchObject({
      kind: "unknown",
      listedAmount: 37488.5,
      checkedAt: "2026-11-02T16:00:00Z",
    });
    expect(
      sourcePriceContext(
        {
          source: "independent_dealer",
          source_url: url,
          ask_price: 0,
          price_evidence: evidence,
          last_seen_at: "2026-11-02T16:00:00Z",
        },
        Date.parse("2026-11-02T16:00:00Z"),
      ),
    ).toMatchObject({
      amount: 37489,
      cashPrice: null,
      comparisonEligible: false,
    });
  });
  it("captures the scoped VDP gallery without logos or related vehicles", () => {
    expect(dealerDetailPhotos(page, url, vin)).toEqual([
      "https://www.jarrettforddadecity.com/front.jpg",
      "https://www.jarrettforddadecity.com/rear.jpg",
    ]);
  });
  it("rejects a mismatched VIN for both prices and gallery", () => {
    expect(dealerVdpObservation(page, url, "1HGCM82633A004352")).toBeNull();
    expect(dealerDetailPhotos(page, url, "1HGCM82633A004352")).toEqual([]);
  });
  it("rejects contradictory primary identity even when structured fallback claims the requested VIN", () => {
    const conflicting =
      page.replace(vin, "1HGCM82633A004352") +
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "Car",
        url,
        vehicleIdentificationNumber: vin,
        location: {
          address: { addressLocality: "Wrong branch", addressRegion: "FL" },
        },
      })}</script>`;
    expect(
      listingLocation(conflicting, url, vin, { allowDealerFallback: false }),
    ).toEqual({});
    expect(
      dealerDetailPriceEvidence(
        load(conflicting),
        { vin, source_url: url },
        { vehicleIdentificationNumber: vin },
        "2026-11-02T16:00:00Z",
      ),
    ).toBeUndefined();
  });
  it("does not take another vehicle's buybox price", () => {
    expect(
      dealerVdpObservation(
        page.replace(
          '<p class="vdp-title">2024 Ford Bronco Big Bend',
          '<p class="vdp-title">2020 Honda Civic',
        ),
        url,
        vin,
      )?.advertisedFinal,
    ).toBeUndefined();
  });
  it("does not overwrite a vehicle with a dealer headquarters fallback in detail enrichment", () => {
    const structured = `<script type="application/ld+json">${JSON.stringify([
      { "@type": "Car", url, vehicleIdentificationNumber: vin },
      {
        "@type": "AutoDealer",
        address: {
          addressLocality: "Dade City",
          addressRegion: "FL",
          postalCode: "33525",
        },
      },
    ])}</script>`;
    expect(
      listingLocation(structured, url, vin, { allowDealerFallback: false }),
    ).toEqual({});
  });
});
