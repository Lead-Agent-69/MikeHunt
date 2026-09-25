# Auction.com API Findings

## Overview

Auction.com is a React SPA that uses a GraphQL API for its search and listing data. It is heavily protected by Datadog RUM and bot protections, so hitting the API requires mimicking browser headers (or running it from the headless fleet/residential proxies).

## Search Endpoint

**Endpoint:** `POST https://graph.auction.com/graphql`
**Method:** `POST`

### Headers Required

```json
{
  "auction-graph-source": "auctioncom",
  "referer": "https://www.auction.com/",
  "accept": "application/json",
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}
```

### Request Body (GraphQL)

The primary query to fetch listings is `resiSearch_blueprint_seekListingsFromFilters`.

```json
{
  "query": "query resiSearch_blueprint_seekListingsFromFilters($filters: ListingCompatabilityFilters!, $aggregationFields: [String!]!, $hasAuthenticatedUser: Boolean!, $requiresAggregation: Boolean!) { seek_listings_from_filters(filters: $filters) { total_count total_pages size current_page aggregation(fields: $aggregationFields) @include(if: $requiresAggregation) content { __typename listing_id urn listing_status_group listing_status listing_status_label(intent: SEARCH) primary_photo primary_property_id listing_photos_count listing_page_path reserve_price @include(if: $hasAuthenticatedUser) is_hot formatted_address(format: DOUBLE_LINE) listing_configuration { product_type is_reserve_displayed is_reserve_price_available broker_commission financing_available buyer_premium_available interior_access_allowed occupancy_status asset_type is_first_look_enabled is_direct_offer_enabled is_third_party_online } attribution_source { origin_code } external_identifiers { data_source external_identifier } venue { venue_type } event { event_code trustee_sale } valuation { seller_current_value_amount } strategy { selling_method_attributes { online_segment_type } } seller_property { street_description municipality country_primary_subdivision country_secondary_subdivision postal_code } program_configuration { program_enrollment_code } seller_terms { inspection_terms { is_option_contingency is_contingency } leaseback_terms { leaseback_period_in_days leaseback_period_rent } finance_terms { finance_preference is_contingency } intent } primary_property { property_id summary { total_bedrooms total_bathrooms square_footage lot_size year_built valuation structure_type_code structure_type_group address { coordinates { lon lat } } } is_currently_saved @include(if: $hasAuthenticatedUser) is_newly_listed current_user_tracking_state { is_seen is_updated } } auction { start_date end_date starting_bid is_online visible_auction_start_date_time bid_instruction { nos_amount } } marketing_tags { tag } open_houses { local_date start_time end_time } listing_summary { is_remote_bid_enabled is_remote_before_and_during_auction_enabled show_opening_bid } external_information(resolvePolicy: CACHE_ONLY) { collateral { summary { estimated low high type } } } selling_method(resolvePolicy: CACHE_ONLY) { __typename ... on OnlineAuctionSegment { _alias_OnlineAuctionSegment__starting_bid_amount: starting_bid_amount _alias_OnlineAuctionSegment__configuration: configuration { is_match_bidding_enabled is_registration_deposit_required_enabled bid_again_count should_bid_again } listing_id __typename start_date segment_type initial_end_date current_time reserve_status starting_bid_amount subject_to_status current_highest_bid { bid_id updated_date bid_amount type terms { status } } segment_status current_increment_amount bid_count result { winning_bid_amount } } ... on LiveAuctionSegment { _alias_LiveAuctionSegment__starting_bid_amount: starting_bid_amount _alias_LiveAuctionSegment__configuration: configuration { state_deposit_rule } current_highest_bid { bid_amount } } } } } }",
  "variables": {
    "filters": {
      "property_state": "TX",
      "listing_type": "active",
      "sort": "auction_date_order",
      "limit": 500,
      "version": 1,
      "offset": 0
    },
    "hasAuthenticatedUser": false,
    "aggregationFields": [
      "primary_property_summary.structure_type_code.keyword",
      "listing_summary.is_remote_bid_enabled"
    ],
    "requiresAggregation": true
  }
}
```

### Response Example

The response contains a rich `content` array under `data.seek_listings_from_filters`.

```json
{
  "data": {
    "seek_listings_from_filters": {
      "total_count": 1438,
      "total_pages": 3,
      "size": 500,
      "current_page": 0,
      "content": [
        {
          "__typename": "Listing",
          "listing_id": "2096465",
          "urn": "adc:listing:2096465",
          "listing_status_group": "ACTIVE",
          "listing_status": "AUCTION_IN_PROGRESS",
          "listing_status_label": "Jun 29 - Jul 01",
          "primary_photo": "https://adc-tenbox-prod.imgix.net/resi/propertyImages/1137380/1137380_10.v1.jpeg?auto=compress,format",
          "primary_property_id": "1137380",
          "is_hot": true,
          "formatted_address": [
            "3029 Granite Rock Trail",
            "Forney, TX 75126, Kaufman County"
          ],
          "listing_configuration": {
            "product_type": "TRUSTEE",
            "asset_type": "FORECLOSURE",
            "occupancy_status": "OCCUPIED"
          },
          "valuation": {
            "seller_current_value_amount": 250000
          },
          "primary_property": {
            "summary": {
              "total_bedrooms": 3,
              "total_bathrooms": 2,
              "square_footage": 1800,
              "lot_size": 5000,
              "year_built": 2005,
              "structure_type_code": "single_family_home",
              "address": {
                "coordinates": {
                  "lon": -96.471649,
                  "lat": 32.74818
                }
              }
            }
          },
          "auction": {
            "start_date": "2024-06-29T13:00:00.000Z",
            "starting_bid": 150000,
            "is_online": true
          }
        }
      ]
    }
  }
}
```

## Next Steps for Claude

1. Replicate the `POST` request to `https://graph.auction.com/graphql` using `smartFetch`.
2. Map the state parameter in the filters (`variables.filters.property_state = "TX"`).
3. The results contain highly detailed metadata (beds/baths/sqft, lat/lng, estimated values) that will easily map to the `properties` table and pass the `deal-analyzer` checks.
