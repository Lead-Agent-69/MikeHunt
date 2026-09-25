# USDA RD Resales Findings

## Overview

USDA RD Resales (resales.usda.gov) is a government portal for Single Family Housing (SFH) foreclosures and resales.

## Discovery Results

During our browser capture (`scripts/usda_capture.ts`), we encountered timeouts when trying to interact with the DOM via Playwright.

1. **AJAX/JS Heavy**: The search endpoints `searchSFH`/`searchMFH` rely on heavy JS to populate the dropdowns.
2. **Hanging/Slow Load**: The site is extremely slow and causes headless runners to time out while waiting for elements like `select#propertyState` to load.

### Recommendation for Claude

Since the volume is extremely low (~15 SFH nationally at any given time), it may be best to use `cheerio` to parse the `property-search.js` populated rows, or run a `smartFetch` that waits explicitly for the network to idle before extracting the HTML content.
The state `<select>` is the live inventory w/ counts, so we can scrape the counts directly from the `<select>` options.
