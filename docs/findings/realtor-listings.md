# Realtor.com Listings

## Extraction Strategy

Realtor.com behaves exactly like Zillow and Redfin. It is an SSR-rendered Next.js/React application heavily protected by PerimeterX/Akamai bot detection.

However, once the HTML is loaded successfully (via headed Chrome or a clean residential proxy), the full search payload and listing data are immediately available in the raw DOM.

1. **`__NEXT_DATA__`**: Present in the `<script id="__NEXT_DATA__">` tag, containing the dehydrated React state with all property data.
2. **Schema.org JSON-LD**: Present via `<script type="application/ld+json">`, containing the structured `RealEstateListing` data.

Because of this, **Claude's `genericExtractProperties` handles it perfectly out of the box**. We don't need a bespoke parser, we just need to supply it with the correct search URLs.

## Sample Search URLs

You can use the following URLs to seed the `genericExtractProperties` fetcher:

```
https://www.realtor.com/realestateandhomes-search/Austin_TX
https://www.realtor.com/realestateandhomes-search/Dallas_TX
https://www.realtor.com/realestateandhomes-search/Chicago_IL
https://www.realtor.com/realestateandhomes-search/Denver_CO
https://www.realtor.com/realestateandhomes-search/Atlanta_GA
```

### Next Steps for Claude

Claude can simply drop Realtor.com into the `genericExtractProperties` pipeline using the fleet's headed fetchers or `smartFetch`, leveraging the same PerimeterX/Akamai bypass logic used for Zillow and Redfin.
