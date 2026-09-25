# Fannie Mae HomePath API

## Search API Endpoint

The Fannie Mae HomePath application (SPA) fetches real estate listings directly via a GET request to their `cfl/property-inventory/search` endpoint using map boundaries.

**URL:** `https://homepath.fanniemae.com/cfl/property-inventory/search?bounds=32.613216,-97.000482,33.023792,-96.46371`
**Method:** `GET`

### Required Headers

No authorization tokens are required, but the API expects specific custom headers:

- `x-fnma-channel: web`
- `x-fnma-entity-id: ` (Can be empty)
- `content-type: application/json`
- `accept: application/json, text/plain, */*`

### Sample Response JSON (One Listing)

```json
{
  "numMyCfl": 0,
  "numCfl": 0,
  "numProperties": 400,
  "totalProperties": 4347,
  "properties": [
    {
      "propertyUuid": "9a791151-7d90-410b-9b63-b2a85a835a87",
      "propertyType": "Single Family",
      "addressLine1": "3032 DAHLIA DRIVE",
      "city": "DALLAS",
      "county": "DALLAS COUNTY",
      "state": "TX",
      "zipCode": "75216",
      "bedrooms": 2.0,
      "bathrooms": 1.0,
      "sqft": 972,
      "yearBuilt": 1955,
      "price": 100000.0,
      "listingType": "LISTED",
      "propertyListingStatus": "RETAIL_LISTING",
      "listingStartDate": 1782446400000,
      "reoId": "D2500Q8",
      "geoPoint": {
        "latitude": 32.69767,
        "longitude": -96.76733
      },
      "externalSystemId": "fd411282-9242-4cd3-9f5c-8cacf13b3c50",
      "primHiResImageUrl": "https://homepath.fanniemae.com/images/2eaac3a2b59b4e9d8f7d9ff646654878/REO2HP_D2500Q8_REOImage_478567401.jpg",
      "totalRecords": 4347,
      "retailStatus": "Just Listed",
      "onlineOfferOnly": true,
      "firstLookProgramIndicator": 3,
      "cflEligibilityIndicator": false,
      "occupancyStatusCode": 1,
      "primaryStatusCode": 9,
      "equatorStatusLabel": "Available",
      "marketingDescLanguageChecked": 1,
      "marketingDescLanguageFlagged": 0,
      "onCart": false,
      "hecmInd": true,
      "userFavorite": false,
      "auction": false,
      "justAdded": false,
      "endingSoon": false,
      "incentive": false,
      "tenantOccupied": false
    }
  ]
}
```

### Next Steps for Claude

Claude can build `lib/scrapers/sources/homepath.ts` by bounding box chunking or state/city iterating. It's a clean JSON API.

## Query Parameters (Discovered)

### 1. Geographic Bounding Box (Required for geography)

- **Parameter**: `bounds`
- **Format**: `minLatitude,minLongitude,maxLatitude,maxLongitude` (comma-separated floats)
- **Example**: `bounds=32.613216,-97.000482,33.023792,-96.46371`

### 2. Price Range

- **Parameters**: `minPrice`, `maxPrice`
- **Format**: Integer values (USD)
- **Example**: `minPrice=200000&maxPrice=500000`

### 3. Property Characteristics

- **Beds/Baths**: `beds`, `baths` (Integer values)
- **Square Footage**: `minSqft`, `maxSqft` (Integer values)
- **Year Built**: `minYb`, `maxYb` (Integer values)

### 4. Sorting

- **Parameter**: `sortBy`
- **Values**:
  - `PRICE_HIGH_TO_LOW`
  - `PRICE_LOW_TO_HIGH`
  - `BEDROOMS`
  - `BATHROOMS`
  - `SQFT`

### 5. Property Types (`propertyTypes`)

Comma-separated string of integer IDs:

- `0`: Plots & Land
- `1`: Single Family
- `2`: Condo
- `3,4,5`: Two to Four Units
- `6`: Manufactured Housing
- `7`: Co-Op

### 6. Listing Types (`listingTypes`)

Comma-separated string of integer IDs:

- `5`: HomePath Listings
- `6`: First Look Program
- `7`: Auction
- `8`: Tenant Occupied

### 7. Property Status (`retailStatus`)

Comma-separated string of integer IDs:

- `20`: Active
- `22`: Just Listed
- `23`: Under Contract
- `24`: Back on Market
- `26`: Price Reduced
- **Example**: `retailStatus=20,23` (Active and Under Contract)
