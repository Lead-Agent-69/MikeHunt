// background.js — DealerHunt Pro extension service worker.
// Owns the cross-origin POST to /api/ingest (content scripts can't set the Authorization header for
// a different origin cleanly). Reads the configured API base + ingest secret from storage.

const DEFAULTS = { apiBase: "http://localhost:3000", ingestSecret: "" };

async function getConfig() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...cfg };
}

async function ingest(payload) {
  const { apiBase, ingestSecret } = await getConfig();
  const base = (apiBase || "").replace(/\/+$/, "");
  if (!base) return { ok: false, error: "Set the API URL in the extension popup." };

  const headers = { "Content-Type": "application/json" };
  if (ingestSecret) headers["Authorization"] = `Bearer ${ingestSecret}`;

  try {
    const res = await fetch(`${base}/api/ingest`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || `HTTP ${res.status}`, status: res.status };
    return { ok: true, ...json, appBase: base };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "INGEST") {
    ingest(msg.payload).then(sendResponse);
    return true; // async
  }
  if (msg && msg.type === "GET_CONFIG") {
    getConfig().then(sendResponse);
    return true;
  }
});
