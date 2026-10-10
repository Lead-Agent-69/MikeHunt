import * as crypto from "crypto";
import * as cheerio from "cheerio";
import { fetchPublicHtml } from "@/lib/net/fetch-public-html";
import { extractFromJsonLd } from "@/lib/scrapers/generic-extractor";

/**
 * Read a listing page. A failed or blocked fetch returns null — URL tokens
 * (a make word plus a 3–5 digit path segment) are never enough to invent a
 * shared deal. Ask price comes only from the fetched page.
 */
export async function scrapeOrParseListing(
  url: string,
  source: string,
): Promise<Record<string, any> | null> {
  const fetched = await fetchPublicHtml(url);
  if (!fetched) return null;

  const data: Record<string, any> = {
    external_id: crypto
      .createHash("md5")
      .update(url)
      .digest("hex")
      .substring(0, 8)
      .toUpperCase(),
    images: [],
    year: undefined,
    make: undefined,
    model: undefined,
    trim: undefined,
    mileage: undefined,
    ask_price: undefined,
    condition: undefined,
    location_city: undefined,
    location_state: undefined,
    vin: "",
    description: "",
  };

  // Make/model/year hints from the fetched URL only. Never a price.
  try {
    const lowercaseUrl = fetched.finalUrl.toLowerCase();
    const yearMatch = lowercaseUrl.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) data.year = parseInt(yearMatch[1], 10);

    const makes = [
      "ford",
      "chevrolet",
      "chevy",
      "toyota",
      "honda",
      "nissan",
      "jeep",
      "dodge",
      "ram",
      "gmc",
      "bmw",
      "mercedes",
      "audi",
      "lexus",
      "subaru",
      "hyundai",
      "kia",
      "mazda",
      "tesla",
      "porsche",
      "volkswagen",
      "vw",
    ];
    for (const make of makes) {
      if (lowercaseUrl.includes(make)) {
        data.make = make.charAt(0).toUpperCase() + make.slice(1);
        if (data.make === "Chevy") data.make = "Chevrolet";
        if (data.make === "Vw") data.make = "Volkswagen";
        break;
      }
    }

    if (data.make) {
      const urlParts = lowercaseUrl
        .replace(/[^a-z0-9]/g, " ")
        .split(" ")
        .filter(Boolean);
      const makeIndex = urlParts.indexOf(data.make.toLowerCase());
      if (makeIndex !== -1 && urlParts[makeIndex + 1]) {
        const skipWords = [
          "and",
          "for",
          "sale",
          "with",
          "salvage",
          "clean",
          "title",
          "used",
          "new",
          "in",
          "near",
        ];
        let modelStr =
          urlParts[makeIndex + 1].charAt(0).toUpperCase() +
          urlParts[makeIndex + 1].slice(1);
        if (
          urlParts[makeIndex + 2] &&
          !skipWords.includes(urlParts[makeIndex + 2]) &&
          !/^\d+$/.test(urlParts[makeIndex + 2])
        ) {
          modelStr +=
            " " +
            urlParts[makeIndex + 2].charAt(0).toUpperCase() +
            urlParts[makeIndex + 2].slice(1);
        }
        data.model = modelStr;
      }
    }
  } catch {
    // URL hints are optional. The page is the source of the ask.
  }

  const $ = cheerio.load(fetched.html);
  if (source === "craigslist") {
    const priceText = $(".price").first().text();
    if (priceText) {
      const parsed = parseFloat(priceText.replace(/[^0-9.]/g, ""));
      if (parsed) data.ask_price = parsed;
    }
    const titleText = $("#titletextonly").text();
    if (titleText) {
      data.title = titleText.trim();
      const parts = titleText.split(" ");
      const yearVal = parseInt(parts[0], 10);
      if (yearVal > 1900) data.year = yearVal;
    }
    const attrGroup = $(".attrgroup").text();
    if (attrGroup) {
      const vinMatch = attrGroup.match(/vin:\s*([A-HJ-NPR-Z0-9]{17})/i);
      if (vinMatch) data.vin = vinMatch[1].toUpperCase();
      const odoMatch = attrGroup.match(/odometer:\s*([0-9,]+)/i);
      if (odoMatch) data.mileage = parseInt(odoMatch[1].replace(/,/g, ""), 10);
    }
    data.description = $("#postingbody")
      .text()
      .replace("QR Code Link to This Post", "")
      .trim();
    $(".gallery img").each((_, img) => {
      const src = $(img).attr("src");
      if (src) data.images.push(src);
    });
  } else if (source === "facebook-marketplace") {
    const priceMatch = $("body").text().match(/\$[0-9,]+/);
    if (priceMatch) {
      const parsed = parseFloat(priceMatch[0].replace(/[^0-9.]/g, ""));
      if (parsed) data.ask_price = parsed;
    }
  } else if (source === "copart") {
    const lotMatch = fetched.finalUrl.match(/lot\/(\d+)/);
    if (lotMatch) data.external_id = lotMatch[1];
  } else if (source === "iaa") {
    const idMatch = fetched.finalUrl.match(/VehicleDetail\/(\d+)/);
    if (idMatch) data.external_id = idMatch[1];
  } else {
    const priceText =
      $('meta[property="product:price:amount"]').attr("content") ||
      $('meta[property="og:price:amount"]').attr("content") ||
      "";
    const parsed = parseFloat(priceText.replace(/[^0-9.]/g, ""));
    if (parsed) data.ask_price = parsed;
  }

  // schema.org Vehicle/Car/Product JSON-LD on the page (most dealer and aggregator listing pages
  // publish it). Page data beats URL guesses; a price still only ever comes from the page.
  try {
    const ld = extractFromJsonLd(fetched.html).find((v) => v.make && v.model);
    if (ld) {
      if (ld.year) data.year = ld.year;
      data.make = ld.make;
      data.model = ld.model;
      if (ld.trim && !data.trim) data.trim = ld.trim;
      if (!data.ask_price && ld.price && ld.price > 0) data.ask_price = ld.price;
      if (!data.mileage && ld.mileage) data.mileage = ld.mileage;
      if (!data.vin && ld.vin) data.vin = String(ld.vin).toUpperCase();
      if (!data.title && ld.title) data.title = ld.title;
      if (ld.image && data.images.length === 0) data.images.push(ld.image);
    }
  } catch {
    // Malformed JSON-LD: keep what the page selectors found.
  }

  if (data.images.length === 0) {
    $('meta[property="og:image"]').each((_, meta) => {
      const content = $(meta).attr("content");
      if (content && content.startsWith("http")) data.images.push(content);
    });
  }

  if (!data.vin || data.vin.length !== 17) data.vin = "";
  if (!data.make || !data.model || !data.ask_price) return null;
  return data;
}
