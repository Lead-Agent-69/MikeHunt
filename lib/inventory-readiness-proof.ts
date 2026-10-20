import { sellerContact } from "@/lib/data/deal-contact";

export type InventoryProofRollup = {
  source?: string | null;
  source_host?: string | null;
  adapter_id?: string | null;
  seller_type?: string | null;
  active_rows: number | string | null;
  stored_active_rows?: number | string | null;
  rows_with_photos: number | string | null;
  vin?: number | string | null;
  title?: number | string | null;
  mileage?: number | string | null;
  damage?: number | string | null;
  price?: number | string | null;
  location?: number | string | null;
  seller?: number | string | null;
  explicit_seller_contact?: number | string | null;
  auction_date?: number | string | null;
  source_link?: number | string | null;
  newest_seen?: string | null;
};

export type InventoryCoverageCounts = {
  photo: number;
  vin: number;
  title: number;
  damage: number;
  mileage: number;
  location: number;
  price: number;
  seller: number;
  sellerContact: number;
  auction: number;
  source: number;
};

export type InventoryReadinessProof = {
  total: number;
  storedTotal: number;
  counts: InventoryCoverageCounts;
  newestSeen: string | null;
};

function count(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

/**
 * Combine the service-only source rollup into one exact buyer-visible proof set.
 * The database function applies the same freshness, photo, and auction-expiry
 * rules as customer inventory before grouping, so retained history cannot skew
 * readiness percentages.
 */
export function summarizeInventoryProofRollups(
  rows: InventoryProofRollup[],
): InventoryReadinessProof {
  const proof: InventoryReadinessProof = {
    total: 0,
    storedTotal: 0,
    counts: {
      photo: 0,
      vin: 0,
      title: 0,
      damage: 0,
      mileage: 0,
      location: 0,
      price: 0,
      seller: 0,
      sellerContact: 0,
      auction: 0,
      source: 0,
    },
    newestSeen: null,
  };

  for (const row of rows) {
    const sourceLinks = count(row.source_link);
    const directSellerLink = sellerContact({
      source: row.source || null,
      source_url: row.source_host
        ? `https://${String(row.source_host).trim().toLowerCase()}/`
        : null,
      options: {
        sourceAdapterId: row.adapter_id || undefined,
        sellerType: row.seller_type || undefined,
      },
    }).url;
    proof.total += count(row.active_rows);
    proof.storedTotal += count(row.stored_active_rows ?? row.active_rows);
    proof.counts.photo += count(row.rows_with_photos);
    proof.counts.vin += count(row.vin);
    proof.counts.title += count(row.title);
    proof.counts.damage += count(row.damage);
    proof.counts.mileage += count(row.mileage);
    proof.counts.location += count(row.location);
    proof.counts.price += count(row.price);
    proof.counts.seller += count(row.seller);
    proof.counts.sellerContact += directSellerLink
      ? sourceLinks
      : count(row.explicit_seller_contact);
    proof.counts.auction += count(row.auction_date);
    proof.counts.source += sourceLinks;

    const newest = row.newest_seen || null;
    if (
      newest &&
      Number.isFinite(Date.parse(newest)) &&
      (!proof.newestSeen || Date.parse(newest) > Date.parse(proof.newestSeen))
    ) {
      proof.newestSeen = newest;
    }
  }

  return proof;
}
