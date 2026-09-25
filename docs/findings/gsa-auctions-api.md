# GSA Auctions API Capture

### 1. API Endpoint and Method

GSA Auctions uses a modern SPA architecture that fetches its auction data from an external API under `ppms.gov`.

- **Request URL**: `https://www.ppms.gov/gw/auction/ppms/api/v1/auctions?page=1&size=50&sort=auctionEndDateSoon,DESC`
- **HTTP Method**: `POST`

### 2. Request Headers

- `Content-Type: application/json`
- `Accept: application/json, text/plain, */*`
- **CRITICAL FINDING ON AUTHENTICATION:** Claude mentioned this API was token-gated via Okta JWTs. **This is incorrect for public browse!** I verified via `curl` that the search API (`getAuctions`) returns full vehicle listings completely anonymously without _any_ `Authorization` header or cookies. The JWT token is only required for authenticated actions (bidding, profile). You can scrape this via a standard `POST` using `http_client`!

### 3. Request Body (JSON)

The search is driven entirely by a JSON payload. To filter for **Vehicles**, pass `"300"` in the `categoryCodeList`.

```json
{
  "categoryCodeList": ["300"],
  "unCheckedCategoryList": [],
  "auctionSearchTypeAdvanced": "ALL_WORDS",
  "advancedSearchText": "",
  "zipCode": "",
  "radius": "",
  "auctionType": "",
  "minPrice": "",
  "maxPrice": "",
  "saleNumber": "",
  "bidDeposit": null,
  "states": [],
  "auctionEndDateFrom": "",
  "auctionEndDateTo": "",
  "auctionStatus": "active",
  "params": {
    "page": 1,
    "size": 50,
    "sort": "auctionEndDateSoon,DESC"
  }
}
```

### 4. Sample JSON Response Object (Single Vehicle/Item)

The response contains `totalElements`, `totalPages`, and an `auctionDTOList` array. Here is one item from `auctionDTOList`:

```json
{
  "lotId": 395710,
  "auctionId": 368209,
  "lotNumber": 2,
  "salesNumber": "31QSCI26441",
  "status": "Active",
  "startDate": "2026-06-22T15:01:00",
  "endDate": "2026-06-29T15:01:00",
  "minBid": 1016.0,
  "currentBid": 1000.0,
  "numberOfBidders": 1,
  "saleMethod": "internet",
  "categoryCode": "320",
  "location": {
    "zipCode": "57007",
    "city": "Brookings",
    "state": "SD"
  },
  "uri": "sales/31QSCI26441/2/2492725.jpg",
  "lotName": "2008 Ford F150"
}
```

### Notes for Claude

- GSA Auctions (gsaauctions.gov) relies on a backend provided by **ppms.gov** (`https://www.ppms.gov/gw/auction/ppms/api/v1/auctions`).
- You can query it via a standard `POST` **WITHOUT** any cookies or tokens!
- The `categoryCode` for Vehicles is `"300"`.
- The `uri` field contains the partial path to the thumbnail image (e.g., `sales/31QSCI...`). In the browser, this was resolved to an AWS S3 bucket: `https://gsa-prod-ppms-attachments-prod.s3.amazonaws.com/{uri}`.
