# Bid4Assets API

## Search API Endpoint

The Bid4Assets Angular SPA fetches auction listings via a `POST` request to its `process` endpoint. It returns a clean JSON array of results.

**Current Status**: Blocked by Akamai Edge Suite / PerimeterX on standard headless/cloud IPs (Returns 403 Access Denied).
Requires the residential proxy FLEET (`smartFetch` via FlareSolverr) to bypass the WAF.

**URL:** `https://www.bid4assets.com/api/search/process?take=25&skip=0&page=1&pageSize=25`
**Method:** `POST`

### Request Headers

- `x-csrf-header-token: <csrf-token>` (Must be scraped from the page or session)
- `x-requested-with: XMLHttpRequest`
- `content-type: application/json`

### Request Payload

```json
{
  "sort": "bidclosetime",
  "sortorder": null,
  "searchtrackingid": "",
  "datehistory": "",
  "type": "powersearch",
  "criteria": "Texas",
  "keywordtype": "allWords",
  "searchfield": null,
  "channel": null,
  "category": null,
  "subcategory": null,
  "assetstatus": "Live",
  "locatedstate": null,
  "zip": null,
  "zipradius": null,
  "sellerid": "",
  "searchtype": "ps",
  "currentsearchquerystring": "&type=powersearch&criteria=TexaskeywordType=allWords&dateHistory=&assetStatus=Live&sort=bidclosetime"
}
```

### Sample Response JSON (One Listing)

```json
{
  "data": [
    {
      "auctionId": 1292507,
      "assetTitle": "Texas, Hudspeth County, 0.14 Acre 79 Eastern Hills #2 Lot 9. No Reserve Cash Sale.",
      "highBidAmount": null,
      "actualCloseTime": "2026-06-29T12:15:00.567",
      "bidOpenTime": "2026-06-27T12:15:33.567",
      "bidCloseTime": "2026-06-29T12:15:00.567",
      "thumbnailImageUrl": "https://publicresources.bid4assets.com/mainimages/MainImage_1292507_23d69e5ad41b49cea95f230f03d7470d.jpg",
      "currentBidString": null,
      "bidCount": -1,
      "closesInString": "1h 29m",
      "currentBid": 0,
      "linkUrl": "/auction/1292507",
      "mainImageUrl": "https://publicresources.bid4assets.com/mainimages/MainImage_1292507_23d69e5ad41b49cea95f230f03d7470d.jpg",
      "timeLeftInSeconds": 5392,
      "locatedCity": "TX",
      "locatedState": "Sierra Blanca"
    }
  ]
}
```

### Next Steps for Claude

Claude can build `lib/scrapers/sources/bid4assets.ts` by pulling the `x-csrf-header-token` from the homepage on a fresh session load (or local storage), then POSTing to the process endpoint.
