# Zillow Listings Capture

## 1. Data Island Extraction Method

Zillow is a Next.js application that uses standard server-side rendering (SSR) data embedding. A capture using a headed Playwright browser confirmed the presence of both `__NEXT_DATA__` and Schema.org metadata:

- **`__NEXT_DATA__`:** Yes, Zillow embeds data in `<script id="__NEXT_DATA__" type="application/json">`.
- **`schema.org`:** Yes, Zillow provides structured data in `<script type="application/ld+json">`. The data includes `@type: "Place"`, `@type: "ItemList"` (for the search results), and `@type: "Event"` (for 3D tours).

**Conclusion:** `genericExtractProperties` will be able to extract Zillow listings out-of-the-box using the `__NEXT_DATA__` and `schema.org` extractors, provided the fetcher (clean IP + headed Chrome) can bypass PerimeterX/Cloudflare.

## 2. Zillow Search URLs

Here are 5 real metro/search URLs for harvesting:

1. `https://www.zillow.com/dallas-tx/`
2. `https://www.zillow.com/austin-tx/`
3. `https://www.zillow.com/seattle-wa/`
4. `https://www.zillow.com/chicago-il/`
5. `https://www.zillow.com/miami-fl/`
