/** Revoke the browser subscription before dropping the authenticated session. */
let pending: Promise<void> | null = null;
export function detachPushForLogout() {
  if (!pending)
    pending = revokeCurrentDevice().finally(() => {
      pending = null;
    });
  return pending;
}

async function revokeCurrentDevice() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  if (!(await subscription.unsubscribe()))
    throw new Error("Could not detach device alerts.");
  window.dispatchEvent(new Event("mikehunt:push-detached"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    // Local revocation stops delivery even if the server is temporarily unreachable.
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: controller.signal,
    });
  } catch {
    // Stale server rows are retired after the provider reports the revoked endpoint.
  } finally {
    clearTimeout(timer);
  }
}
