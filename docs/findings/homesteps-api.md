# Freddie Mac HomeSteps

## Overview

Freddie Mac's HomeSteps property search does not use a client-side JSON API. It uses Server-Side Rendering (SSR) via Drupal to generate HTML.

- **Search URL**: `https://www.homesteps.com/listing/search`
- **Response Format**: HTML (SSR)
- **Method**: GET

## Query Parameters

### 1. Location / Keyword

- **Parameter**: `search`
- **Behavior**: Accepts city names, zip codes, or specific addresses.
  - _Note:_ Simple queries like `Dallas` or `Katy` successfully limit results to those areas. However, queries like `Dallas, TX` can cause the search engine to perform an OR match on the terms, resulting in matching any property in "TX" and returning listings from all over the state.
  - _Autocomplete:_ The site has a JSON autocomplete endpoint that suggests specific addresses. Selecting an address goes directly to `/listingdetails/[address-slug]`.

### 2. Price Filters (Mapped IDs)

- **Parameter**: `price_min`
  - Values: `1` ($10k), `2` ($20k), `3` ($30k), `4` ($50k), `5` ($70k), `6` ($90k), `10` ($170k), `15` ($270k)
- **Parameter**: `price_max`
  - Values: `11` ($190k), `12` ($210k), `15` ($270k), `20` ($390k), `25` ($490k), `32` ($630k)

### 3. Property Characteristics

- **Beds**: `bed` (Values: `1`, `2`, `3`, `4`, or `All`)
- **Baths**: `bath` (Values: `1`, `2`, `3`, or `All`)
- **Type**: `type` (Value: `6` for Single-Family)

### 4. Sorting

- **Parameter**: `sort_by`
- **Values**:
  - `field_first_look` (Default / First Look)
  - `created` (Newest)
  - `field_price` (Price: Low to High)
  - `field_price_1` (Price: High to Low)
  - `field_bathroom` (Bathrooms)
  - `field_bedrooms` (Bedrooms)
  - `field_living_area_size` (Living Area)

## Example Query

```
https://www.homesteps.com/listing/search?search=Dallas&bed=3&bath=2&type=6
```

## Strategy

To scrape HomeSteps, we need to perform `smartFetch` (or standard GET if it's not protected by Cloudflare/PerimeterX) on the `/listing/search` HTML page with specific location keywords, and parse the resulting SSR HTML cards (using a cheerio-based scraper similar to GSA Real Estate or PublicSurplus).
