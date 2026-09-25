# Redfin Listings Extraction Strategy

**Target**: `redfin.com`
**Method**: HTML embedded `schema.org/SingleFamilyResidence` extraction.

Unlike standard Single Page Applications (SPAs) that fetch listings via an XHR JSON payload, or Next.js sites that expose `__NEXT_DATA__`, Redfin embeds property listings directly into the DOM using standard `application/ld+json` schema.org markup.

We can bypass Redfin's PerimeterX bot protection and dynamic React state management by parsing these embedded JSON-LD scripts directly from the HTML source.

## Extraction Logic

Redfin injects multiple `<script type="application/ld+json">` tags, each containing a property represented as a `schema.org/SingleFamilyResidence` or similar entity.

Claude's `genericExtractProperties` is already designed to parse `schema.org/RealEstateListing` and similar structured data, making this a drop-in integration.

**Extraction approach**:

```javascript
import * as cheerio from "cheerio";

const $ = cheerio.load(html);
const properties = [];

$('script[type="application/ld+json"]').each((i, el) => {
  const text = $(el).html();
  if (text) {
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (
        item["@type"] &&
        (item["@type"].includes("Residence") ||
          item["@type"].includes("RealEstate"))
      ) {
        properties.push(item);
      }
    }
  }
});
```

## Sample Listing Object (`schema.org/SingleFamilyResidence`)

```json
{
  "@context": "http://schema.org",
  "name": "4708 Frontier Trl, Austin, TX 78745",
  "url": "https://www.redfin.com/TX/Austin/4708-Frontier-Trl-78745/home/31957252",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "4708 Frontier Trl",
    "addressLocality": "Austin",
    "addressRegion": "TX",
    "postalCode": "78745",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 30.2254569,
    "longitude": -97.7933119
  },
  "numberOfRooms": 3,
  "floorSize": {
    "@type": "QuantitativeValue",
    "value": 1376,
    "unitCode": "FTK"
  },
  "@type": "SingleFamilyResidence"
}
```

This extraction method cleanly avoids hitting any heavily-protected XHR JSON APIs and successfully extracts Redfin inventory directly from the SSR HTML.

## REDFIN_SEARCH_URLS

Here are 5 real Redfin metro/search URLs to be used for the harvest:

1. `https://www.redfin.com/city/30794/TX/Dallas`
2. `https://www.redfin.com/city/30818/TX/Austin`
3. `https://www.redfin.com/city/16163/WA/Seattle`
4. `https://www.redfin.com/city/29470/IL/Chicago`
5. `https://www.redfin.com/city/11458/FL/Miami`
