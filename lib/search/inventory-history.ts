export const INVENTORY_URL_EVENT = "inventory-url-change";

export function replaceInventoryHistory(url: string) {
  // Keep the active router tree and return position while filters update in place.
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(INVENTORY_URL_EVENT));
}
