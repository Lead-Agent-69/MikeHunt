# AllSurplus API Capture

### 1. API Endpoint and Method

- **Request URL**: `https://maestro.lqdt1.com/search/list` (Same backend as GovDeals)
- **HTTP Method**: `POST`

### 2. Request Payload Key Differences vs GovDeals

The payload structure is identical to GovDeals, with the key difference being the **`businessId`**.

- **`businessId`**: `"AD"` (GovDeals uses `"GD"`)

### 3. Categories (facetsFilter)

For AllSurplus, the vehicles fall under the **Transportation** category.

- **Transportation Category Code**: `"t6"` (Includes subcategories like Trucks, Passenger Vehicles, Vehicle Equipment and Parts, Specialized Vehicles, Buses, Trailers, Marine, Aviation, and Railroad).

To filter purely for vehicles, use:

```json
"facetsFilter": [
  "{!tag=product_category_external_id}product_category_external_id:\"t6\""
]
```

### 4. Sample JSON Request Payload

```json
{
  "accountIds": [],
  "auctionTypeId": null,
  "businessId": "AD",
  "categoryIds": "",
  "displayRows": 120,
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
    "{!tag=product_category_external_id}product_category_external_id:\"t6\""
  ],
  "isQAL": false,
  "locationId": null,
  "makebrand": "",
  "model": "",
  "page": 1,
  "requestType": "search",
  "responseStyle": "fullResponse",
  "searchText": "trucks",
  "sellerTypeId": null,
  "sessionId": "86816987-ff30-45fe-ae18-8001672472e6",
  "sortField": "bestfit",
  "sortOrder": "desc",
  "timeType": ""
}
```
