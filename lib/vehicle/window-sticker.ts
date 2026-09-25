// lib/vehicle/window-sticker.ts
// Free OEM Monroney (window sticker) lookup by VIN — the same trick Visor uses for its "2M window
// stickers". Each automaker serves the ORIGINAL factory sticker (MSRP + factory options + fuel
// economy) by VIN at a public endpoint. Confirmed live: Ford (1.6MB PDF), GM (cws), Stellantis
// (VIN-dependent). No paid data, no login. Availability is per-VIN (newer vehicles only).

const STELLANTIS_HOSTS: Record<string, string> = {
  ram: "ramtrucks",
  jeep: "jeep",
  dodge: "dodge",
  chrysler: "chrysler",
  fiat: "fiatusa",
  "alfa romeo": "alfaromeousa",
};

/** Resolve the OEM window-sticker URL for a VIN + make, or null when unsupported. */
export function windowStickerUrl(
  vin?: string | null,
  make?: string | null,
): string | null {
  if (!vin || vin.length !== 17) return null;
  const v = vin.toUpperCase();
  const m = (make || "").toLowerCase().trim();
  if (m === "ford" || m === "lincoln")
    return `https://www.windowsticker.forddirect.com/windowsticker.pdf?vin=${v}`;
  if (["chevrolet", "chevy", "gmc", "buick", "cadillac"].includes(m))
    return `https://cws.gm.com/vs-cws/vehshop/v2/vehicle/windowsticker?vin=${v}`;
  for (const [brand, host] of Object.entries(STELLANTIS_HOSTS))
    if (m.includes(brand))
      return `https://www.${host}.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${v}`;
  return null;
}

/** Whether we have a window-sticker source for this make at all (drives showing the button). */
export function hasWindowSticker(make?: string | null): boolean {
  return windowStickerUrl("X".repeat(17), make) !== null;
}
