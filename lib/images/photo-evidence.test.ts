import { describe, expect, it } from "vitest";
import { isPlaceholderPhotoUrl, photoEvidence } from "./photo-evidence";
import {
  isPlaceholderPhotoBody,
  isPlaceholderPhotoFingerprint,
} from "./photo-fingerprint";
import {
  isCustomerInventory,
  listingPhotos,
  reportedListingPhotos,
} from "@/lib/search/customer-inventory";
import { gradeDataQuality } from "@/lib/data-quality";
import { completenessScore, missingFields } from "@/lib/data-quality/sanity";

const placeholder =
  "https://thumb.autotempest.com/cgu/1FDBF2AN6VEC67291_461748235_725a472cc3c53688563f3c07811b3cc0_3_0647371b4de74ad3c65a580fb9d44269.webp";
const vehicle = "https://dealer.test/one-vehicle-photo.jpg";
const comingSoon =
  "https://thumb.autotempest.com/cgu/3GNAXTEG2VL254379_462491482_313a6e27729c693363f3423cf5d3a729_1_c32e3555544e478c346ed8c8106a6155.webp";

describe("known placeholder evidence", () => {
  it("excludes the visually verified coming-soon graphic without rejecting other supplier vehicle images", () => {
    const realSupplierPhoto =
      "https://thumb.autotempest.com/cgu/3GNAXTEG9VL217152_460494295_ca491455ea37c755173650ada42e4cf4_1_818e89cc1f4a055642cd4c290fb57c33.webp";
    expect(photoEvidence([comingSoon, realSupplierPhoto]).images).toEqual([
      realSupplierPhoto,
    ]);
    expect(
      isCustomerInventory({
        images: [comingSoon],
        last_seen_at: new Date().toISOString(),
      }),
    ).toBe(false);
    expect(
      isPlaceholderPhotoFingerprint(
        "d99d31a97c71fb1ea1769ba84bfa787a4c54789b4bfcbf3290c83f92cbafe5ef",
      ),
    ).toBe(true);
    expect(
      isPlaceholderPhotoFingerprint(
        "eb2426274104bd5b46cbf6bf7d515fd2cf3a459ee6d572285abaee047c0e8a87",
      ),
    ).toBe(false);
    expect(
      isPlaceholderPhotoUrl(
        comingSoon.replace("thumb.autotempest.com", "example.test"),
      ),
    ).toBe(false);
  });
  it("recognizes the verified source asset without broad vehicle/VIN matching", () => {
    expect(isPlaceholderPhotoUrl(placeholder)).toBe(true);
    expect(
      isPlaceholderPhotoUrl(
        `/api/image/proxy?url=${encodeURIComponent(placeholder)}`,
      ),
    ).toBe(true);
    expect(
      isPlaceholderPhotoUrl(
        placeholder.replace("thumb.autotempest.com", "example.test"),
      ),
    ).toBe(false);
    expect(
      isPlaceholderPhotoUrl(
        placeholder.replace(
          "725a472cc3c53688563f3c07811b3cc0",
          "11111111111111111111111111111111",
        ),
      ),
    ).toBe(false);
    expect(isPlaceholderPhotoUrl(vehicle)).toBe(false);
    expect(
      isPlaceholderPhotoUrl(placeholder.replace("461748235", "461748236")),
    ).toBe(false);
    expect(isPlaceholderPhotoUrl("broken URL")).toBe(false);
    expect(isPlaceholderPhotoUrl("/api/image/proxy?url=/api/image/proxy")).toBe(
      false,
    );
  });
  it("separates original reported artifacts from usable display candidates", () => {
    const raw = [placeholder, vehicle, vehicle];
    expect(photoEvidence(raw)).toEqual({
      images: [vehicle],
      placeholderUrls: [placeholder],
      placeholderCount: 1,
      reportedCount: 2,
    });
    expect(raw).toHaveLength(3);
    expect(reportedListingPhotos([placeholder])).toEqual([placeholder]);
    expect(listingPhotos([placeholder])).toEqual([]);
    expect(
      isCustomerInventory({
        images: [placeholder],
        last_seen_at: new Date().toISOString(),
        options: { photoAudit: { state: "placeholder" } },
      }),
    ).toBe(false);
  });
  it("does not count a placeholder cover or image fallback as completeness", () => {
    const quality = gradeDataQuality({
      images: [placeholder],
      imageUrl: placeholder,
    });
    expect(quality.missing).toContain("photo");
    expect(quality.present).not.toContain("photo");
    expect(missingFields({ images: [placeholder] })).toContain("photo");
    expect(
      completenessScore({ images: [vehicle] }) -
        completenessScore({ images: [placeholder] }),
    ).toBe(25);
    expect(gradeDataQuality({ images: [vehicle] }).present).toContain("photo");
    expect(listingPhotos([placeholder, vehicle])).toEqual([vehicle]);
  });
  it("removes obvious branding artwork without matching arbitrary vehicle filenames", () => {
    const logo = "https://www.billsmithauto.com/images/logo.png";
    expect(listingPhotos([logo, vehicle])).toEqual([vehicle]);
    expect(
      isPlaceholderPhotoUrl(`/api/image/proxy?url=${encodeURIComponent(logo)}`),
    ).toBe(true);
    expect(
      isPlaceholderPhotoUrl(
        "https://dealer.test/photos/ford-logo-on-grille.jpg",
      ),
    ).toBe(false);
    expect(isPlaceholderPhotoUrl("https://dealer.test/photos/12345.jpg")).toBe(
      false,
    );
    expect(isPlaceholderPhotoUrl("https://dealer.test/logo-dark.svg")).toBe(
      true,
    );
    expect(isPlaceholderPhotoUrl("https://dealer.test/no-image1.jpg")).toBe(
      true,
    );
  });
  it("honors exact audited placeholder URLs without hiding newer photos", () => {
    expect(listingPhotos([vehicle], { placeholderUrls: [vehicle] })).toEqual(
      [],
    );
    expect(
      listingPhotos([vehicle], {
        state: "placeholder",
        placeholderUrls: [placeholder],
      }),
    ).toEqual([vehicle]);
    expect(listingPhotos([vehicle], { placeholderUrls: "malformed" })).toEqual([
      vehicle,
    ]);
  });
  it("retains the expanded device-gallery limit without losing placeholder filtering", () => {
    const images = Array.from(
      { length: 30 },
      (_, index) => `https://dealer.test/vehicle-${index}.jpg`,
    );
    expect(listingPhotos(images)).toHaveLength(20);
    expect(listingPhotos(images, 30)).toEqual(images);
    expect(listingPhotos([placeholder, vehicle], 30)).toEqual([vehicle]);
  });
  it("uses exact content fingerprints, not an inferred picture or damage verdict", () => {
    expect(
      isPlaceholderPhotoFingerprint(
        "ef3211bbb7d87a7725d5b7123e1e9282a3187c1851c77d0ef57d9623753f78ab",
      ),
    ).toBe(true);
    expect(isPlaceholderPhotoBody(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(isPlaceholderPhotoFingerprint("not-a-hash")).toBe(false);
  });
});
