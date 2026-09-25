# GovDeals Image CDN Capture

**Extracted Base Path:**
`https://webassets.lqdt1.com/assets/photos/`

**Full Image URL Example (from Asset 31897 / 7):**
`https://webassets.lqdt1.com/assets/photos/31897/31897_7_fd55d055-3be8-480c-b13c-b4548aa0af98.jpg`

The GovDeals API returns the photo filename like `31897_7_fd55d055-3be8-480c-b13c-b4548aa0af98.jpg?cb=260623195503`. To construct the full image URL, you can prepend:
`https://webassets.lqdt1.com/assets/photos/{accountId}/`
where `{accountId}` is `31897`.
