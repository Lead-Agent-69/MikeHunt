/** Regional search anchors, not listing locations or claims of complete municipal coverage. */
export const MISSOURI_SEARCH_MARKETS = [
  { city: "St. Louis", zip: "63101" },
  { city: "Kansas City", zip: "64106" },
  { city: "Springfield", zip: "65806" },
  { city: "Columbia", zip: "65201" },
  { city: "Joplin", zip: "64801" },
  { city: "Kirksville", zip: "63501" },
  { city: "Osage Beach", zip: "65065" },
  { city: "Cape Girardeau", zip: "63701" },
  { city: "St. Joseph", zip: "64501" },
  { city: "Hannibal", zip: "63401" },
  { city: "Kennett", zip: "63857" },
  { city: "Rolla", zip: "65401" },
  { city: "West Plains", zip: "65775" },
  { city: "Sedalia", zip: "65301" },
  { city: "Nevada", zip: "64772" },
  { city: "Maryville", zip: "64468" },
  { city: "Chillicothe", zip: "64601" },
] as const;

export const MISSOURI_SEARCH_ZIPS = MISSOURI_SEARCH_MARKETS.map(
  (market) => market.zip,
);
