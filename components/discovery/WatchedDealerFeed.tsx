"use client";

import useSWR from "swr";
import Link from "next/link";
import { useDealerWatch } from "@/hooks/useDealerWatch";
import { proxiedImage } from "@/lib/image-url";
import { CURATED_SITES, SITE_TYPE_META } from "@/lib/scrapers/curated-sites";

// The payoff of the dealer watchlist: newest listings across every shop you watch, so you catch their fresh
// cars the moment they post — with the accurate title status + our resale, right here. When empty, it still
// confirms exactly which shops are being watched and what has to happen next.

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const money = (n?: number | null) =>
  n != null ? `$${Math.round(n).toLocaleString()}` : "—";

type SourceHealthItem = {
  id: string;
  name: string;
  readiness?: string;
  activeRows?: number;
  rowsWithPhotos?: number;
  averageQuality?: number;
  lastStatus?: string;
  lastSeenAt?: string | null;
};

type DealerProofItem = {
  host: string;
  cataloged: boolean;
  imported: boolean;
  readiness: "ready" | "no_rows" | "cataloged" | "unknown";
  name: string;
  url: string;
  inventoryUrl: string;
  state?: string | null;
  typeLabel: string;
  typeBlurb: string;
  rows: number;
  rowsWithPhotos: number;
  photoCoveragePct?: number;
  averageQuality: number;
  lastSeenAt?: string | null;
  freshnessHours?: number | null;
  sampleTitles?: string[];
  userStatus?: string;
  proofLevel?: string;
  userImpact?: string;
  nextAction: string;
};

const TITLE_COLOR: Record<string, string> = {
  clean_title: "var(--green)",
  clean: "var(--green)",
  rebuilt_title: "var(--amber)",
  repairable: "var(--amber)",
  run_drive: "var(--amber)",
  salvage_title: "var(--red)",
  parts_only: "var(--t4)",
  flood: "var(--blue)",
  fire: "var(--red)",
  hail: "var(--amber)",
};
const TITLE_LABEL: Record<string, string> = {
  clean_title: "Clean",
  clean: "Clean",
  rebuilt_title: "Rebuilt",
  repairable: "Repairable",
  run_drive: "Runs",
  salvage_title: "Salvage",
  parts_only: "Parts",
  flood: "Flood",
  fire: "Fire",
  hail: "Hail",
};

export function WatchedDealerFeed() {
  const watch = useDealerWatch();
  const key = watch.hosts.length
    ? `/api/scan?dealers=${encodeURIComponent(watch.hosts.join(","))}&limit=30`
    : null;
  const { data } = useSWR(key, fetcher, { revalidateOnFocus: false });
  const { data: health } = useSWR("/api/scrape/health", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const { data: dealerProof } = useSWR(
    watch.hosts.length
      ? `/api/dealer-watch/proof?hosts=${encodeURIComponent(watch.hosts.join(","))}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  if (!watch.hosts.length) return null;
  const curatedHealth: SourceHealthItem | undefined = health?.sources?.find(
    (source: SourceHealthItem) => source.id === "curated_dealers",
  );
  const readiness = curatedHealth?.readiness || "not_configured";
  const readinessLabel: Record<string, string> = {
    ready: "Ready",
    no_rows: "No rows",
    needs_run: "Needs run",
    needs_login: "Needs login",
    blocked: "Blocked",
    not_configured: "Setup needed",
    disabled: "Disabled",
  };
  const watchedSites = watch.hosts.map((host) => {
    const normalized = host.replace(/^www\./, "");
    const matchesHost = (candidate: string) =>
      candidate === normalized ||
      candidate.endsWith(`.${normalized}`) ||
      normalized.endsWith(`.${candidate}`);
    const site = CURATED_SITES.find((row) => {
      try {
        const rowHost = new URL(row.url).hostname.replace(/^www\./, "");
        const inventoryHost = row.inventoryUrl
          ? new URL(row.inventoryUrl).hostname.replace(/^www\./, "")
          : "";
        return (
          matchesHost(rowHost) ||
          (inventoryHost ? matchesHost(inventoryHost) : false)
        );
      } catch {
        return false;
      }
    });
    return { host, site };
  });
  const proofByHost = new Map<string, DealerProofItem>(
    ((dealerProof?.dealers || []) as DealerProofItem[]).map((dealer) => [
      dealer.host,
      dealer,
    ]),
  );
  const proofSummary = {
    cataloged: Number(dealerProof?.catalogedDealers || 0),
    imported: Number(dealerProof?.importedDealers || 0),
    total: Number(dealerProof?.total || watch.hosts.length),
  };
  const cars = ((data?.vehicles || []) as any[])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.firstSeenAt || 0).getTime() -
        new Date(a.firstSeenAt || 0).getTime(),
    )
    .slice(0, 20);
  const proofCards = watchedSites.map(({ host, site }) => {
    const proof = proofByHost.get(host);
    const rows = proof?.rows || 0;
    const ready = proof?.readiness === "ready";
    const href =
      proof?.inventoryUrl ||
      site?.inventoryUrl ||
      site?.url ||
      `https://${host}`;
    return {
      host,
      site,
      proof,
      rows,
      ready,
      href,
    };
  });
  const watchedRowsWithPhotos = proofCards.reduce(
    (sum, card) => sum + Number(card.proof?.rowsWithPhotos || 0),
    0,
  );
  const watchedQuality =
    proofCards.reduce(
      (sum, card) =>
        sum + Number(card.proof?.averageQuality || 0) * Number(card.rows || 0),
      0,
    ) /
    Math.max(
      1,
      proofCards.reduce((sum, card) => sum + Number(card.rows || 0), 0),
    );

  return (
    <section className="min-w-0">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t5)]">
            Dealer watch
          </p>
          <h2 className="text-sm font-black text-[var(--t1)]">
            New from your watched dealers{" "}
            <span className="text-[var(--t4)] font-bold">
              · {watch.hosts.length} shop{watch.hosts.length > 1 ? "s" : ""}
            </span>
          </h2>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/scan?dealers=${encodeURIComponent(watch.hosts.join(","))}&sort=newest`}
            className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-bold text-[var(--t2)]"
          >
            Open watch scan
          </Link>
          <Link
            href={`/scan?dealers=${encodeURIComponent(watch.hosts.join(","))}&sort=newest`}
            className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-bold text-[var(--t2)]"
          >
            Find matches
          </Link>
        </div>
      </div>

      {!cars.length && (
        <div className="glass-panel p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-bold text-[var(--t1)]">
                Watchlist saved. No imported rows from these shops yet.
              </p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--t4)]">
                {proofSummary.cataloged} of {proofSummary.total} watched shops
                are recognized in the curated small-shop catalog.{" "}
                {proofSummary.imported
                  ? `${proofSummary.imported} already have imported rows.`
                  : "No watched shop has imported rows in this environment yet."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-1 text-[10px] font-black text-[var(--amber-d)]">
                {readinessLabel[readiness] || readiness}
              </span>
              <Link
                href={`/scan?dealers=${encodeURIComponent(watch.hosts.join(","))}&sort=newest`}
                className="rounded-full border border-[var(--b2)] bg-[var(--s0)] px-3 py-1 text-[10px] font-black text-[var(--t3)] hover:text-[var(--t1)]"
              >
                search
              </Link>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                Dealer source
              </div>
              <div className="mt-1 text-xs font-black text-[var(--t1)]">
                {curatedHealth?.name || "Curated dealer network"}
              </div>
              <div className="mt-1 text-[11px] text-[var(--t4)]">
                {readinessLabel[readiness] || readiness}
              </div>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                Imported rows
              </div>
              <div className="mt-1 text-xs font-black text-[var(--t1)]">
                {Number(curatedHealth?.activeRows || 0).toLocaleString()} rows
              </div>
              <div className="mt-1 text-[11px] text-[var(--t4)]">
                {Number(curatedHealth?.rowsWithPhotos || 0).toLocaleString()}{" "}
                with photos
              </div>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                Detail quality
              </div>
              <div className="mt-1 text-xs font-black text-[var(--t1)]">
                {Number(curatedHealth?.averageQuality || 0)}%
              </div>
              <div className="mt-1 text-[11px] text-[var(--t4)]">
                {curatedHealth?.lastSeenAt
                  ? `seen ${new Date(curatedHealth.lastSeenAt).toLocaleString()}`
                  : "not imported yet"}
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {proofCards.map(({ host, site, proof, rows, ready, href }) => {
              return (
                <a
                  key={host}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 transition-colors hover:border-[var(--amber-bd)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-[var(--t1)]">
                        {proof?.name || site?.name || host}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-[var(--t5)]">
                        {proof
                          ? `${proof.state || "multi-state"} · ${proof.typeLabel}`
                          : site
                            ? `${site.state || "multi-state"} · ${SITE_TYPE_META[site.type].label}`
                            : "custom dealer"}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase"
                      style={{
                        background: ready
                          ? "var(--glo)"
                          : proof?.cataloged || site
                            ? "var(--amber-lo)"
                            : "var(--s2)",
                        color: ready
                          ? "var(--green)"
                          : proof?.cataloged || site
                            ? "var(--amber-d)"
                            : "var(--t4)",
                        border: "1px solid var(--b1)",
                      }}
                    >
                      {ready
                        ? proof?.userStatus || "Rows"
                        : proof?.cataloged || site
                          ? proof?.userStatus || "Catalog"
                          : "New"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                    <span className="rounded bg-[var(--s0)] px-1.5 py-1 font-bold text-[var(--t3)]">
                      {rows.toLocaleString()} rows
                    </span>
                    <span className="rounded bg-[var(--s0)] px-1.5 py-1 font-bold text-[var(--t3)]">
                      {Number(proof?.photoCoveragePct || 0)}% photos
                    </span>
                    <span className="rounded bg-[var(--s0)] px-1.5 py-1 font-bold text-[var(--t3)]">
                      {Number(proof?.averageQuality || 0)}% quality
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {proof?.proofLevel && (
                      <span className="rounded-full bg-[var(--s0)] px-2 py-0.5 text-[9px] font-black uppercase text-[var(--t5)]">
                        {proof.proofLevel.replace(/_/g, " ")}
                      </span>
                    )}
                    {proof?.freshnessHours != null && (
                      <span className="rounded-full bg-[var(--s0)] px-2 py-0.5 text-[9px] font-black uppercase text-[var(--t5)]">
                        {proof.freshnessHours}h fresh
                      </span>
                    )}
                  </div>
                  <div className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-[var(--t4)]">
                    {proof?.userImpact ||
                      proof?.nextAction ||
                      "Cataloged shop. Connect imports to prove fresh rows."}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {!!cars.length && (
        <div className="space-y-3">
          <div className="glass-panel p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                  Watched source proof
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--t3)]">
                  {proofSummary.imported} of {proofSummary.total} watched shops
                  have imported rows in this scope.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[var(--r2)] bg-[var(--s1)] px-3 py-2">
                  <div className="text-sm font-black text-[var(--t1)]">
                    {cars.length}
                  </div>
                  <div className="text-[10px] text-[var(--t5)]">shown</div>
                </div>
                <div className="rounded-[var(--r2)] bg-[var(--s1)] px-3 py-2">
                  <div className="text-sm font-black text-[var(--green)]">
                    {watchedRowsWithPhotos.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[var(--t5)]">photos</div>
                </div>
                <div className="rounded-[var(--r2)] bg-[var(--s1)] px-3 py-2">
                  <div className="text-sm font-black text-[var(--t1)]">
                    {Math.round(watchedQuality)}%
                  </div>
                  <div className="text-[10px] text-[var(--t5)]">quality</div>
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {proofCards.map(({ host, site, proof, rows, ready, href }) => (
                <a
                  key={`proof-${host}`}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 transition-colors hover:border-[var(--amber-bd)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-[var(--t1)]">
                        {proof?.name || site?.name || host}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-[var(--t5)]">
                        {proof?.userStatus ||
                          (ready
                            ? "Working"
                            : proof?.cataloged || site
                              ? "Cataloged"
                              : "New")}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase"
                      style={{
                        background: ready ? "var(--glo)" : "var(--amber-lo)",
                        color: ready ? "var(--green)" : "var(--amber-d)",
                        border: "1px solid var(--b1)",
                      }}
                    >
                      {ready ? "Ready" : proof?.readiness || "Proof"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                    <span className="rounded bg-[var(--s0)] px-1.5 py-1 font-bold text-[var(--t3)]">
                      {rows.toLocaleString()} rows
                    </span>
                    <span className="rounded bg-[var(--s0)] px-1.5 py-1 font-bold text-[var(--t3)]">
                      {Number(proof?.photoCoveragePct || 0)}% photos
                    </span>
                    <span className="rounded bg-[var(--s0)] px-1.5 py-1 font-bold text-[var(--t3)]">
                      {Number(proof?.averageQuality || 0)}% quality
                    </span>
                  </div>
                  <div className="mt-2 truncate text-[10px] font-semibold text-[var(--t4)]">
                    {proof?.lastSeenAt
                      ? `Last seen ${new Date(proof.lastSeenAt).toLocaleString()}`
                      : proof?.nextAction || "Proof pending"}
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
            {cars.map((c) => {
              const img =
                Array.isArray(c.images) && c.images[0]?.startsWith?.("http")
                  ? proxiedImage(c.images[0])
                  : null;
              return (
                <Link
                  key={c.id}
                  href={`/deal/${c.id}`}
                  className="shrink-0 w-44 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] overflow-hidden hover:border-[var(--amber-bd)] transition-colors"
                >
                  <div className="relative h-24 bg-[var(--s2)] grid place-items-center">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="opacity-30">🚗</span>
                    )}
                    {c.condition && TITLE_LABEL[c.condition] && (
                      <span
                        className="absolute bottom-1 left-1 text-[9px] font-black px-1 py-0.5 rounded text-white"
                        style={{ background: TITLE_COLOR[c.condition] }}
                      >
                        {TITLE_LABEL[c.condition]}
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="text-[12px] font-bold text-[var(--t1)] truncate">
                      {[c.year, c.make, c.model].filter(Boolean).join(" ")}
                    </div>
                    <div className="text-[11px] text-[var(--t4)]">
                      {money(c.askPrice)}
                      {c.sellEstimate != null && (
                        <span> · resale ~{money(c.sellEstimate)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
