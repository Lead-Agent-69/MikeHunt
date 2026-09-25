# FSBO.com API

## Overview

FSBO.com provides national "For Sale By Owner" property listings.

- **Architecture**: Next.js App Router (React Server Components).
- **Search URL**: `https://fsbo.com/search`
- **Method**: GET

## Query Parameters (Discovered)

The search state is persisted via URL query parameters instead of a separate JSON REST API:

- **Location Query**: `q`
  - Example: `q=Dallas%2C+TX`
- **Property Type**: `propertyType`
  - Example: `propertyType=SINGLE_FAMILY`
- **Minimum Price**: `minPrice`
  - Example: `minPrice=200000`

## Data Retrieval Strategy

Because FSBO.com leverages Next.js Server Components, the initial property payload is injected directly into the HTML response as part of the React Server Component payload (e.g., `<script>self.__next_f.push(...)</script>`).

There is no dedicated `api/search` JSON endpoint observed on the initial load.

### Recommended approach:

1. Fetch the search URL (e.g. `https://fsbo.com/search?q=Dallas%2C+TX`) using `smartFetch` to handle basic bot protections.
2. Parse the returned HTML using a DOM parser (like Cheerio) to extract the listing cards directly from the rendered HTML.
3. Alternatively, extract the `__next_f.push` JavaScript blocks, parse the embedded JSON, and reconstruct the property array from the React state (this can be brittle but yields structured data).

## Example Query

```
https://fsbo.com/search?q=Dallas%2C+TX&propertyType=SINGLE_FAMILY&minPrice=200000
```
