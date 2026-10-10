/** Which channel a pasted listing URL belongs to (fee model + per-site page parsing). */
export function detectSource(url: string): string {
  const lowercase = url.toLowerCase();
  if (lowercase.includes("craigslist.org")) return "craigslist";
  if (lowercase.includes("facebook.com")) return "facebook-marketplace";
  if (lowercase.includes("copart.com")) return "copart";
  if (lowercase.includes("iaai.com")) return "iaa";
  if (lowercase.includes("ebay.com") || lowercase.includes("ebay.to"))
    return "ebay-motors";
  if (lowercase.includes("autotrader.com")) return "autotrader";
  if (lowercase.includes("cars.com")) return "cars-com";
  if (lowercase.includes("cargurus.com")) return "cargurus";
  if (lowercase.includes("carmax.com")) return "carmax";
  if (lowercase.includes("carvana.com")) return "carvana";
  return "web-share";
}
