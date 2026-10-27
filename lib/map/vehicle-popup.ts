import { proxiedImage } from "@/lib/image-url";
import { reportedPrice } from "@/lib/deals/reported-price";
import { titleBadgeHtml, titleBadgeModel } from "@/lib/deals/title-badge-model";
import { sourceLabel } from "@/lib/sources/source-meta";

export type VehicleMapPreview = {
  name: string;
  image?: string;
  price?: number;
  priceLabel?: string;
  valueText?: string;
  label?: string;
  approx?: boolean;
  url?: string;
  source?: string;
  condition?: string | null;
  damageType?: string | null;
  titleSource?: string | null;
};
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export function vehiclePopup(point: VehicleMapPreview) {
  const image =
    point.image && /^https?:\/\//.test(point.image)
      ? proxiedImage(point.image)
      : null;
  const link =
    point.url && /^\/deal\/[a-zA-Z0-9%-]+$/.test(point.url) ? point.url : null;
  return `<article style="width:224px;font:14px/1.4 system-ui;color:var(--map-text,#111);background:var(--map-panel,#fff)">
    ${image ? `<div style="min-height:140px;background:var(--map-photo,#eef0f3)"><img data-vehicle-popup-photo src="${escape(image)}" alt="${escape(point.name)}" loading="lazy" decoding="async" style="width:224px;height:140px;object-fit:contain" /><p data-vehicle-popup-photo-fallback hidden style="padding:16px;color:var(--map-muted,#555)">Photo could not load. Check the original listing before travelling.</p></div>` : '<p style="padding:12px;color:var(--map-muted,#555)">Photo not available</p>'}
    <div style="padding:12px"><h3 style="font-size:15px;line-height:1.35;margin:0 0 6px;overflow-wrap:anywhere">${escape(point.name)}</h3>
    <p style="margin:4px 0;font-size:12px;color:var(--map-muted,#555)">${escape(point.priceLabel || "Advertised amount")}</p><strong style="font-size:20px">${escape(point.valueText ?? reportedPrice(point.price))}</strong>
    <p style="font-size:12px;color:var(--map-muted,#555)">${escape(sourceLabel(point.source))}</p>
    ${titleBadgeHtml(titleBadgeModel(point))}
    ${point.approx ? '<p style="font-size:12px;color:var(--map-muted,#555)">Approximate location. Verify the seller address.</p>' : ""}
    ${link ? `<a href="${escape(link)}" style="display:flex;align-items:center;min-height:44px;font-weight:700;color:var(--map-link,#0058e6)">View vehicle</a>` : ""}
    </div></article>`;
}

/** DOM listeners keep failed remote photos readable without inline scripts or guessed replacements. */
export function watchVehiclePopupPhoto(root: HTMLElement) {
  const image = root.querySelector<HTMLImageElement>(
    "[data-vehicle-popup-photo]",
  );
  const fallback = root.querySelector<HTMLElement>(
    "[data-vehicle-popup-photo-fallback]",
  );
  if (!image || !fallback) return () => {};
  const failed = () => {
    image.hidden = true;
    fallback.hidden = false;
  };
  image.addEventListener("error", failed, { once: true });
  if (image.complete && image.currentSrc && image.naturalWidth === 0) failed();
  return () => image.removeEventListener("error", failed);
}
