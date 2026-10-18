type PhotoRow = {
  source: string | undefined;
  source_deal_id: string;
  source_url: string | undefined;
  images: string[];
  vin?: string | null;
  options?: Record<string, any>;
  photo_audit?: Record<string, any> | null;
  photo_check_attempt?: Record<string, any> | null;
};

const sourceUrlIdentity = (value: string | undefined) =>
  value?.startsWith("//") ? `https:${value}` : value;

/** An inventory thumbnail is a partial observation, not an instruction to erase a gallery. */
export async function preserveListingPhotos(
  client: any,
  rows: PhotoRow[],
): Promise<void> {
  const sources = new Set(rows.map((row) => row.source).filter(Boolean));
  for (const source of Array.from(sources)) {
    const candidates = rows.filter((row) => row.source === source);
    for (let offset = 0; offset < candidates.length; offset += 100) {
      const batch = candidates.slice(offset, offset + 100);
      const { data, error } = await client
        .from("deals")
        .select(
          "source_deal_id,source_url,vin,images,photo_audit:options->photoAudit,photo_check_attempt:options->photoCheckAttempt",
        )
        .eq("source", source)
        .in(
          "source_deal_id",
          batch.map((row) => row.source_deal_id),
        );
      if (error) throw error;
      const stored = new Map<string, PhotoRow>(
        (data || []).map((row: PhotoRow) => [row.source_deal_id, row]),
      );
      for (const row of batch) {
        const previous = stored.get(row.source_deal_id);
        if (
          !previous ||
          !row.source_url ||
          sourceUrlIdentity(previous.source_url) !==
            sourceUrlIdentity(row.source_url) ||
          !Array.isArray(previous.images)
        )
          continue;
        const auditedImages = previous.photo_audit?.originalImages;
        const observedImages = Array.isArray(auditedImages)
          ? auditedImages.filter(
              (image): image is string => typeof image === "string",
            )
          : previous.images;
        // Inventory pages may keep advertising a cover that the verifier already replaced.
        // Only genuinely new URLs invalidate the audit, not a subset of its original gallery.
        if (
          previous.photo_audit &&
          observedImages.length > 0 &&
          row.images.every((image) => observedImages.includes(image))
        ) {
          row.images = [...previous.images].slice(0, 20);
          row.options = {
            ...row.options,
            photoAudit: previous.photo_audit,
            ...(previous.photo_check_attempt
              ? { photoCheckAttempt: previous.photo_check_attempt }
              : {}),
          };
          continue;
        }
        // CMS cards may use a resized cover URL. An exact VIN match still identifies the gallery;
        // a different VIN or an unavailable-photo audit must never revive it.
        const sameVehicle =
          !!row.vin &&
          /^[A-HJ-NPR-Z0-9]{17}$/.test(row.vin) &&
          row.vin === previous.vin;
        if (
          previous.images.length > row.images.length &&
          (row.images.every((image) => previous.images.includes(image)) ||
            (sameVehicle &&
              row.images.length === 1 &&
              previous.photo_audit?.state !== "unavailable"))
        ) {
          row.images = [...previous.images].slice(0, 20);
        }
        // Re-observing the same failed URLs is not proof that their photos recovered.
        if (
          previous.photo_audit &&
          previous.images.length === row.images.length &&
          row.images.every((image) => previous.images.includes(image))
        )
          row.options = { ...row.options, photoAudit: previous.photo_audit };
        if (
          previous.photo_check_attempt &&
          previous.images.length === row.images.length &&
          row.images.every((image) => previous.images.includes(image))
        )
          row.options = {
            ...row.options,
            photoCheckAttempt: previous.photo_check_attempt,
          };
      }
    }
  }
}
