import { sendDealSignal } from "@/lib/reco/client";
import { UUID_RE } from "@/lib/reco/signals";

/**
 * Reco signals from existing list actions. Best-effort through lib/reco/client: fire-and-forget,
 * never throws, and guests are rejected server-side (401) with nothing stored. Only call these
 * after the action itself succeeded, and only with a real deal id.
 */
export function signalUnsave(dealId: unknown) {
  if (typeof dealId !== "string" || !UUID_RE.test(dealId)) return;
  sendDealSignal({ dealId, kind: "unsave" });
}

export function signalDismiss(dealId: unknown) {
  if (typeof dealId !== "string" || !UUID_RE.test(dealId)) return;
  sendDealSignal({ dealId, kind: "dismiss" });
}
