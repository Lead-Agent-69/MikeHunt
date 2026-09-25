# GSA Real Estate Capture Strategy

**Target**: `realestatesales.gov` (GSA Federal Real Estate Auctions)
**Method**: HTML Parsing (Server-Side Rendered)

Unlike its sibling site `gsaauctions.gov` (which uses an SPA with a JSON API at `ppms.gov`), `realestatesales.gov` is a traditional server-side rendered application. Property listings are embedded directly into the HTML within `<div class="itemm">` elements. There is no hidden JSON API or `__NEXT_DATA__` island.

## Request Details

- **Method**: `GET`
- **URL**: `https://realestatesales.gov/our-listing/` (or `/our-listing/?listing_type=closed_listing` for past auctions).

## Extraction Logic

You can fetch the HTML using a standard HTTP GET request and parse the DOM elements using Cheerio.

**Selector / DOM Parsing Strategy**:

```javascript
import * as cheerio from "cheerio";

const $ = cheerio.load(html);
const properties = [];

$(".itemm").each((i, el) => {
  const propertyLink = $(el).find("a").attr("href"); // e.g. /asset-details/?property_id=59
  const imageSrc = $(el).find(".slide-img").attr("src");
  const currentBid = $(el).find(".property-price span").text().trim();
  const title = $(el).find(".property-info h2").text().trim();
  const address = $(el)
    .find(".property-info h5")
    .text()
    .trim()
    .replace(/\s+/g, " ");
  const dates = $(el).find(".covert_auction_date_range_all_listings");
  const startDate = dates.attr("data-start-date");
  const endDate = dates.attr("data-end-date");
  const tags = [];
  $(el)
    .find("ul.tags li h3")
    .each((_, tagEl) => {
      tags.push($(tagEl).text().trim());
    });

  properties.push({
    propertyId: propertyLink.split("=")[1],
    title,
    address,
    currentBid,
    imageSrc,
    startDate,
    endDate,
    tags,
  });
});
```

## Sample Extracted Object

```json
{
  "propertyId": "59",
  "title": "2107 Jackson St - USCG Port Lavaca Housing",
  "address": "2107 Jackson Street Port Lavaca, TX 77979",
  "currentBid": "$30,000",
  "imageSrc": "https://d2m3yrz4x1yefr.cloudfront.net/property_image/1779305039.6496737_1-1-SQFT-9526.jpg",
  "startDate": "2026-05-21T19:00:00Z",
  "endDate": "2026-07-15T18:00:00Z",
  "tags": ["Online Auction", "Residential"]
}
```

Since the data is present in the raw HTML without relying on Javascript execution or complex tokens, `genericExtractProperties` or a simple bespoke Cheerio parser can easily harvest this inventory directly.
