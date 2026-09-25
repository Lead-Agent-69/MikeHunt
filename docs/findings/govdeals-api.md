# GovDeals API Capture

### 1. API Endpoint and Method

- **Request URL**: `https://maestro.lqdt1.com/search/list`
- **HTTP Method**: `POST`

### 2. Request Headers

```http
Accept: application/json, text/plain, */*
Content-Type: application/json
Ocp-Apim-Subscription-Key: cf620d1d8f904b5797507dc5fd1fdb80
x-api-key: af93060f-337e-428c-87b8-c74b5837d6cd
x-ecom-session-id: 5b62274d-1287-4c68-8355-1213cc1d4ad0
x-page-unique-id: aHR0cHM6Ly93d3cuZ292ZGVhbHMuY29tL2VuL2F1dG9tb2JpbGVzLWNhcnMvZmlsdGVycz9zbz1hc2Mmc2Y9Y3VycmVudGJpZA=
x-referer: https://www.govdeals.com/en/automobiles-cars/filters?so=asc&sf=currentbid
x-user-id: -1
x-user-timezone: America/Chicago
```

### 3. Request Body (JSON Payload)

```json
{
  "categoryIds": "",
  "businessId": "GD",
  "searchText": "*",
  "isQAL": false,
  "locationId": null,
  "model": "",
  "makebrand": "",
  "auctionTypeId": null,
  "page": 1,
  "displayRows": 120,
  "sortField": "currentbid",
  "sortOrder": "asc",
  "sessionId": "9cbc3fa0-6324-42c6-88e3-f5c5d2a4b32d",
  "requestType": "search",
  "responseStyle": "fullResponse",
  "facets": [
    "categoryName",
    "auctionTypeID",
    "condition",
    "saleEventName",
    "sellerDisplayName",
    "product_pricecents",
    "isReserveMet",
    "hasBuyNowPrice",
    "isReserveNotMet",
    "sellerType",
    "warehouseId",
    "region",
    "currencyTypeCode",
    "categoryName",
    "tierId"
  ],
  "facetsFilter": [
    "{!tag=product_category_external_id}product_category_external_id:\"t6\"",
    "{!tag=product_category_external_id}product_category_external_id:\"94Q\"",
    "{!tag=product_category_external_id}product_category_external_id:\"94A\""
  ],
  "timeType": "",
  "sellerTypeId": null,
  "accountIds": []
}
```

### 4. Sample Vehicle Object in JSON Response

```json
{
  "accountId": 31897,
  "assetId": 7,
  "auctionId": 1,
  "inventoryId": null,
  "assetShortDescription": "2000 Toyota Avalon XL",
  "makebrand": "Toyota",
  "model": "Avalon",
  "modelYear": "2000",
  "assetCategory": "94A",
  "categoryDescription": "Automobiles/Cars",
  "assetLongDescription": null,
  "locationId": 0,
  "locationAddress1": null,
  "locationAddress2": null,
  "locationCity": "Santa Ana",
  "locationState": "CA",
  "locationZip": "92701",
  "country": "USA",
  "latitude": null,
  "longitude": null,
  "assetAuctionStartDate": "2026-06-23T20:04:41",
  "assetAuctionEndDate": "2026-07-01T17:00:00",
  "assetBidPrice": null,
  "currentBid": 10.0,
  "highBidder": null,
  "bidCount": null,
  "groupId": "GNP",
  "commDesc": null,
  "companyName": "Alberto's Towing LLC - Impound/Towing, CA",
  "termsAndConditions": null,
  "photo": "31897_7_fd55d055-3be8-480c-b13c-b4548aa0af98.jpg?cb=260623195503",
  "countryDescription": null,
  "stateDescription": "California",
  "denyProbBids": null,
  "keywords": null,
  "businessId": "GD",
  "assetRestrictionCode": null,
  "allowProbationBidders": false,
  "eventId": null,
  "auctionTypeId": 3,
  "bidWatchId": 0,
  "proximityDistance": 0.0,
  "currencyCode": "USD",
  "assetStatusCd": null,
  "assetAuctionStartDateDisplay": "June 23, 2026 07:04 PM CDT",
  "assetAuctionEndDateDisplay": "July 01, 2026 04:00 PM CDT",
  "lotNumber": -1,
  "displaySellerName": null,
  "displayEventId": "GD-Event [NA]",
  "assetAuctionEndDateUtc": "2026-07-01T21:00:00Z",
  "timeRemaining": "4:1:36:10",
  "isReserveNotMet": false,
  "willNextBidMeetReserve": null,
  "clickUrl": "https://recs.richrelevance.com/rrserver/api/find/v1/track/click/...",
  "categoryRoutepath": "",
  "isSoldAuction": false
}
```
