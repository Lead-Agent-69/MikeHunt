// content.js — runs on supported listing pages. Extracts the vehicle, injects a floating
// "Send to DealerHunt" button, and shows the returned verdict. Honest extraction: never fabricates
// a price/title — if it can't find them, it tells you.

(function () {
  if (window.__dhpInjected) return;
  window.__dhpInjected = true;

  const MAKES = ["ford","chevrolet","chevy","gmc","ram","dodge","jeep","toyota","honda","nissan","hyundai","kia","subaru","mazda","volkswagen","vw","bmw","mercedes","mercedes-benz","audi","lexus","acura","infiniti","cadillac","buick","chrysler","lincoln","tesla","porsche","volvo","mitsubishi","mini","jaguar","land rover","genesis"];

  function sourceFor(host) {
    if (host.includes("copart")) return "copart";
    if (host.includes("iaai")) return "iaa";
    if (host.includes("facebook")) return "facebook_marketplace";
    if (host.includes("craigslist")) return "craigslist";
    if (host.includes("cars.com")) return "cars_com";
    if (host.includes("autotrader")) return "autotrader";
    if (host.includes("cargurus")) return "cargurus";
    if (host.includes("ebay")) return "ebay_motors";
    if (host.includes("carvana")) return "carvana";
    if (host.includes("vroom")) return "vroom";
    if (host.includes("truecar")) return "truecar";
    if (host.includes("offerup")) return "offerup";
    return "independent_dealer";
  }

  function jsonLd() {
    const out = {};
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        let data = JSON.parse(s.textContent);
        const arr = Array.isArray(data) ? data : [data];
        for (const node of arr) {
          const items = node["@graph"] ? node["@graph"] : [node];
          for (const it of items) {
            const t = (it["@type"] || "").toString().toLowerCase();
            if (t.includes("vehicle") || t.includes("car") || t.includes("product")) {
              if (it.name && !out.title) out.title = it.name;
              if (it.vehicleIdentificationNumber) out.vin = it.vehicleIdentificationNumber;
              if (it.modelDate || it.productionDate) out.year = parseInt(it.modelDate || it.productionDate);
              if (it.brand && (it.brand.name || typeof it.brand === "string")) out.make = it.brand.name || it.brand;
              if (it.model && !out.model) out.model = typeof it.model === "string" ? it.model : it.model.name;
              if (it.mileageFromOdometer && it.mileageFromOdometer.value) out.mileage = parseInt(it.mileageFromOdometer.value);
              const offer = it.offers && (Array.isArray(it.offers) ? it.offers[0] : it.offers);
              if (offer && offer.price && !out.price) out.price = String(offer.price);
              if (it.image && !out.image_url) out.image_url = Array.isArray(it.image) ? it.image[0] : (it.image.url || it.image);
            }
          }
        }
      } catch (_) {}
    }
    return out;
  }

  function og(prop) {
    const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
    return el ? el.getAttribute("content") : null;
  }

  function findPrice() {
    const meta = og("product:price:amount") || og("og:price:amount");
    if (meta) return meta;
    // First plausible $ amount on the page.
    const text = document.body.innerText.slice(0, 20000);
    const m = text.match(/\$\s?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,6})/);
    return m ? m[0] : "";
  }

  // ISO-3779 check digit so we only ever send a real VIN (not a 17-char order/ref number).
  function vinValid(raw) {
    const vin = (raw || "").toUpperCase().replace(/[\s-]/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
    const tr = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9,
      "0":0,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9 };
    const w = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += tr[vin[i]] * w[i];
    const r = sum % 11;
    return vin[8] === (r === 10 ? "X" : String(r));
  }

  function findVin() {
    // Prefer a labeled VIN, else the first checksum-valid 17-char token on the page.
    const text = document.body.innerText;
    const labeled = text.match(/VIN[:#\s]*([A-HJ-NPR-Z0-9]{17})/i);
    if (labeled && vinValid(labeled[1])) return labeled[1].toUpperCase();
    const re = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
    let m;
    while ((m = re.exec(text.toUpperCase())) !== null) {
      if (vinValid(m[0])) return m[0];
    }
    return undefined;
  }

  // US state from JSON-LD address or a "City, ST" pattern in the page.
  function findLocation() {
    const out = {};
    const text = document.body.innerText;
    const m = text.match(/([A-Z][a-zA-Z.\- ]+),\s*([A-Z]{2})\b(?:\s+\d{5})?/);
    if (m) {
      out.location_city = m[1].trim().slice(0, 60);
      out.location_state = m[2];
    }
    return out;
  }

  function findMileage() {
    const m = document.body.innerText.match(/([0-9]{1,3}(?:,[0-9]{3})|[0-9]{4,6})\s*(?:miles|mi\b|odometer)/i);
    return m ? parseInt(m[1].replace(/,/g, "")) : undefined;
  }

  function parseYMM(title) {
    const out = {};
    const y = (title || "").match(/\b(19[8-9]\d|20[0-3]\d)\b/);
    if (y) out.year = parseInt(y[1]);
    const lower = (title || "").toLowerCase();
    for (const mk of MAKES) {
      if (lower.includes(mk)) {
        out.make = mk === "chevy" ? "Chevrolet" : mk === "vw" ? "Volkswagen" : mk.replace(/\b\w/g, (c) => c.toUpperCase());
        const after = lower.split(mk)[1] || "";
        const words = after.trim().split(/\s+/).filter(Boolean);
        if (words[0]) out.model = words[0].replace(/\b\w/g, (c) => c.toUpperCase());
        break;
      }
    }
    return out;
  }

  function extract() {
    const ld = jsonLd();
    const title = ld.title || og("og:title") || document.querySelector("h1")?.innerText?.trim() || document.title;
    const ymm = parseYMM(title);
    const loc = findLocation();
    // Validate a JSON-LD VIN before trusting it; fall back to a page scan.
    const vin = (ld.vin && vinValid(ld.vin) ? ld.vin.toUpperCase() : undefined) || findVin();
    // Bounded description so the server can recover a VIN/details we missed.
    const description = (og("og:description") || "").slice(0, 1500) || undefined;
    return {
      url: window.location.href.split("?")[0],
      source: sourceFor(window.location.hostname),
      title: (title || "").trim().slice(0, 200),
      price: ld.price || findPrice(),
      year: ld.year || ymm.year,
      make: ld.make || ymm.make,
      model: ld.model || ymm.model,
      vin,
      mileage: ld.mileage || findMileage(),
      location_city: loc.location_city,
      location_state: loc.location_state,
      description,
      image_url: ld.image_url || og("og:image") || undefined,
    };
  }

  // ── UI ──
  function toast(html, color) {
    const el = document.createElement("div");
    el.innerHTML = html;
    Object.assign(el.style, {
      position: "fixed", right: "20px", bottom: "84px", zIndex: 2147483647,
      background: "#1b1320", color: "#fff", padding: "12px 16px", borderRadius: "12px",
      font: "600 13px/1.4 system-ui, sans-serif", maxWidth: "300px", boxShadow: "0 8px 30px rgba(0,0,0,.4)",
      borderLeft: `3px solid ${color || "#f25b9a"}`,
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 9000);
  }

  async function send() {
    const data = extract();
    if (!data.title || !data.price) {
      toast("⚠️ Couldn't read a title + price on this page. Open the full listing.", "#ff7a4d");
      return;
    }
    btn.textContent = "Sending…";
    btn.disabled = true;
    chrome.runtime.sendMessage({ type: "INGEST", payload: data }, (res) => {
      btn.textContent = "⚡ Send to DealerHunt";
      btn.disabled = false;
      if (!res || !res.ok) {
        toast(`❌ ${res && res.error ? res.error : "Failed to send."}`, "#ef5b6b");
        return;
      }
      const d = res.deal;
      if (d && d.deal_verdict) {
        const v = String(d.deal_verdict).toUpperCase();
        const col = v === "GO" ? "#3fae8e" : v === "HOLD" ? "#e0a948" : "#9b8b9b";
        const profit = d.true_net_profit != null ? ` · $${Math.round(d.true_net_profit).toLocaleString()} profit` : "";
        const bid = d.recommended_max_bid != null ? `<br>Max bid: $${Math.round(d.recommended_max_bid).toLocaleString()}` : "";
        const link = d.id && res.appBase ? `<br><a href="${res.appBase}/deal/${d.id}" target="_blank" style="color:#f25b9a">Open in DealerHunt →</a>` : "";
        toast(`<b style="color:${col}">${v}</b>${profit}${bid}${link}`, col);
      } else {
        toast("✅ Sent to DealerHunt.", "#3fae8e");
      }
    });
  }

  const btn = document.createElement("button");
  btn.textContent = "⚡ Send to DealerHunt";
  Object.assign(btn.style, {
    position: "fixed", right: "20px", bottom: "20px", zIndex: 2147483647,
    background: "linear-gradient(135deg,#ff7a4d,#f25b9a 55%,#9b6bff)", color: "#fff",
    border: "none", padding: "12px 18px", borderRadius: "999px", cursor: "pointer",
    font: "700 14px system-ui, sans-serif", boxShadow: "0 6px 24px rgba(242,91,154,.45)",
  });
  btn.addEventListener("click", send);
  document.body.appendChild(btn);

  // Popup can also trigger a send.
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg && msg.action === "scrape") { send(); reply({ started: true }); }
  });
})();
