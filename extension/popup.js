const DEFAULTS = { apiBase: "http://localhost:3000", ingestSecret: "" };
const $ = (id) => document.getElementById(id);

// Load saved settings.
chrome.storage.sync.get(DEFAULTS, (cfg) => {
  $("apiBase").value = cfg.apiBase || "";
  $("ingestSecret").value = cfg.ingestSecret || "";
});

$("saveBtn").addEventListener("click", () => {
  chrome.storage.sync.set(
    { apiBase: $("apiBase").value.trim(), ingestSecret: $("ingestSecret").value.trim() },
    () => { $("status").textContent = "✅ Settings saved."; },
  );
});

$("scrapeBtn").addEventListener("click", async () => {
  $("status").textContent = "Sending…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: "scrape" }, (resp) => {
      if (chrome.runtime.lastError) {
        $("status").textContent = "Open a supported car listing first.";
        return;
      }
      $("status").textContent = resp && resp.started ? "Sent — check the page for the verdict." : "Done.";
    });
  } catch (e) {
    $("status").textContent = "Error: " + e.message;
  }
});
