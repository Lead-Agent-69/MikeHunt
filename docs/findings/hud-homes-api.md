# HUD Homes Extraction Strategy

**Target**: `hudhomestore.gov` (HUD Homes)
**Method**: Server-Side Rendering (ASP.NET), HTML embedded JSON extraction.

Unlike standard Single Page Applications (SPAs) that fetch listings via XHR, HUD Homes server-side renders the search results and embeds the entire listing payload into a hidden `<input>` element on the page. This means we can extract all listings with a simple HTML GET request and regex/DOM parsing without needing to execute JavaScript or simulate API requests.

## Request Details

- **Method**: `GET`
- **URL Example**: `https://www.hudhomestore.gov/searchresult?citystate=TX` (URL parameters control the search filters)

## Extraction Logic

The property listings are JSON-encoded inside the `value` attribute of a hidden input with `id="available_prop"`.

**Selector / Regex**:

```javascript
// Using DOM
const jsonStr = document.getElementById("available_prop").value;
const properties = JSON.parse(jsonStr);

// Using Regex (if parsing raw HTML)
const match = html.match(/id="available_prop"\s+value="([^"]+)"/);
if (match) {
  // Unescape HTML entities
  const jsonStr = match[1].replace(/&quot;/g, '"');
  const properties = JSON.parse(jsonStr);
}
```

## Sample Listing Object

```json
{
  "propertyCaseNumber": "512-510068",
  "propertyCityStateZip": "Richmond, TX, 77406",
  "propertyAddress": "2206 Spanish Forest Ln",
  "propertyCity": "Richmond",
  "propertyState": "TX",
  "propertyZip": "77406",
  "propertyCounty": "Fort Bend",
  "listPrice": "561200",
  "bedrooms": "5",
  "bathrooms": "3.1",
  "bathroomsdecimal": 3.1,
  "propertyAge": "31",
  "squareFootage": "4482",
  "yearBuilt": "1995",
  "fhaFinancing": "IN (Insured)",
  "listingPeriod": "Extended",
  "propertyStatus": "Price Reduced",
  "propertyStatusDesc": "Price Reduced",
  "listDate": "05/19/2026",
  "periodDeadlineDate": "10/12/2026",
  "bidOpenDate": "06/29/2026",
  "latitude": "29.6375",
  "longitude": "-95.7414",
  "amenities": null,
  "inAmenities": "Fireplace,",
  "outAmenities": "Patio/Deck,Pool/Spa,Porch,Fence,",
  "parkingType": "Garage",
  "numberOfStories": "2.0",
  "propertyType": "Single Family Home",
  "galleryImages": "\"Front_73676887.png\",\"Back_73676888.png\",\"Bath_73676889.png\",\"Interior_73676892.png\",\"Kitchen_73676891.png\",\"i1_73676893.png\",\"i2_73676895.png\",\"i3_73676896.png\",\"i4_73676897.png\",\"i5_73676898.png\"",
  "bidderTypes": "Investor,Owner Occupant,Nonprofit,Government Agency,",
  "eligibleBidders": "All Bidders",
  "propertyThumb": "https://res.cloudinary.com/yardi/image/upload/q_auto,f_auto,c_limit/d_hhs:themes:common:images:NoImage.jpg/hhs/Front_73676887.png",
  "isFavorite": false,
  "sellingBrokerCommission": 0,
  "listingBrokerCommission": 0,
  "SpecialProgram100Down": "Yes"
}
```

## Images Base URL

Construct full images from `galleryImages` by splitting on commas and prepending the base URL derived from `propertyThumb`, e.g., `https://res.cloudinary.com/yardi/image/upload/q_auto,f_auto,c_limit/d_hhs:themes:common:images:NoImage.jpg/hhs/{imageName}`.
