import { describe, expect, it } from "vitest";
import { listingLocation } from "./listing-location";
const page = (nodes: unknown[]) =>
  `<script type="application/ld+json">${JSON.stringify(nodes)}</script>`;
const url = "https://dealer.example/inventory/123";
const dealer = {
  "@type": "AutoDealer",
  address: {
    addressLocality: "Lindon",
    addressRegion: "UT",
    postalCode: "84042",
    addressCountry: "US",
  },
  geo: { latitude: 40.3494, longitude: -111.7273 },
};
describe("listingLocation", () => {
  it("recovers the exact Craigslist offer address and map coordinates", () => {
    const html =
      page([
        {
          "@type": "Product",
          offers: {
            availableAtOrFrom: {
              address: {
                addressLocality: "Saint Louis",
                addressRegion: "MO",
                postalCode: "63133",
              },
            },
          },
        },
      ]) +
      '<section id="postingbody">Camaro</section><div id="map" data-latitude="38.6779" data-longitude="-90.3033"></div>';
    expect(
      listingLocation(html, "https://www.craigslist.org/view/d/camaro/abc"),
    ).toEqual({
      location_city: "Saint Louis",
      location_state: "MO",
      location_zip: "63133",
      lat: 38.6779,
      lng: -90.3033,
    });
  });
  it("uses the single selling dealer on an identified vehicle page", () => {
    expect(
      listingLocation(
        page([
          dealer,
          {
            "@type": ["Product", "Car"],
            vehicleIdentificationNumber: "4S4BTGPDXR3189930",
            url,
          },
        ]),
        url,
        "4S4BTGPDXR3189930",
      ),
    ).toMatchObject({
      location_city: "Lindon",
      location_zip: "84042",
      lat: 40.3494,
    });
  });
  it("rejects another VIN even when the URL matches", () => {
    expect(
      listingLocation(
        page([
          dealer,
          { "@type": "Car", vehicleIdentificationNumber: "OTHER", url },
        ]),
        url,
        "EXPECTED",
      ),
    ).toEqual({});
  });
  it("does not borrow a related vehicle's location", () => {
    expect(
      listingLocation(
        page([
          dealer,
          { "@type": "Car", url: "https://dealer.example/inventory/other" },
        ]),
        url,
      ),
    ).toEqual({});
  });
  it("does not choose a branch when multiple dealers are present", () => {
    expect(
      listingLocation(
        page([
          dealer,
          {
            ...dealer,
            address: { ...dealer.address, addressLocality: "Provo" },
          },
          { "@type": "Car", url },
        ]),
        url,
      ),
    ).toEqual({});
  });
  it("rejects null coordinates, foreign addresses, and malformed structured data", () => {
    const foreign = {
      ...dealer,
      address: { ...dealer.address, addressCountry: "CA" },
    };
    expect(
      listingLocation(page([foreign, { "@type": "Car", url }]), url),
    ).toEqual({});
    expect(
      listingLocation(
        page([
          { ...dealer, geo: { latitude: null, longitude: -111 } },
          { "@type": "Car", url },
        ]),
        url,
      ),
    ).not.toHaveProperty("lat");
    expect(
      listingLocation(
        '<script type="application/ld+json">broken</script>',
        url,
      ),
    ).toEqual({});
  });
});
