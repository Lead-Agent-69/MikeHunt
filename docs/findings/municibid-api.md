# Municibid API Capture

### 1. API Endpoint and Method

Municibid does not appear to use a standard JSON API for its main search results (the full search results page seems to be server-rendered or uses embedded JSON like `srp-markers-data`).
However, it exposes a public JSON autocomplete/suggestion API that returns live vehicle listings, including their current price and auction end date.

- **Request URL**: `https://municibid.com/Search/Suggest?q=<Query>` (e.g., `q=Ford` or empty/category queries)
- **HTTP Method**: `GET`

### 2. Request Headers

- `X-Requested-With: XMLHttpRequest` (Standard fetch header)
- _Note: No API keys, authorization tokens, or session cookies are required to access this endpoint. It is fully public._

### 3. Request Body

None (GET request).

### 4. Sample JSON Response Object (Single Vehicle Item)

```json
{
  "end": "/Date(1783956600000)/",
  "id": 83984584,
  "img": "https://storagemunicibidpro.blob.core.windows.net/assets/media/9aa47174-00ed-4383-aa94-900a32734ad4_thumbcrop.jpg",
  "price": 3700,
  "title": "2013 Ford F-150"
}
```

### Notes for Claude

- The `id` (e.g., `83984584`) can be used to construct the item link: `https://municibid.com/Listing/Details/83984584`
- The `end` timestamp is in a Microsoft JSON date format (`/Date(ms)/`) and needs parsing.
- The `img` is a direct Azure blob storage URL for the thumbnail.
- If this endpoint does not support complex category filtering or returns too few results, the alternative is to parse the `srp-markers-data` JSON blob embedded in the main HTML source of `https://municibid.com/Browse/C7/Automotive-and-Vehicles`.
