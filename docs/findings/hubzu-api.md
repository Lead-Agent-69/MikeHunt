# Hubzu Findings

## Overview

Hubzu is an Angular/React SPA for foreclosure/REO homes.

## Discovery Results

During our browser capture (`scripts/hubzu_capture.ts`), we noticed that hitting the search pages directly (e.g., `https://www.hubzu.com/homes/texas`) triggers CMS payload requests and user-tracking events, but does not immediately trigger an XHR request for the property listings in a simple parseable format.

### Obstacles

1. The property payload is either embedded within the SSR response or requires interaction with the map/paginator to fire the XHR.
2. Datadog RUM and Amplitude analytics are highly active, and the site checks session state (`isLogin`) continuously.
3. Accessing the raw data likely requires a headed browser run on the fleet to click through the UI and intercept the resulting API calls, or a dedicated DOM parser using Cheerio for the SSR output.

## Next Steps for Claude

- Deploy a headless script to dump the raw DOM of `https://www.hubzu.com/homes/texas` on the fleet to see if listings are embedded in a global state object (e.g. `window.__INITIAL_STATE__`).
- If it's dynamically loaded, a headed Playwright capture of a search action is needed.
