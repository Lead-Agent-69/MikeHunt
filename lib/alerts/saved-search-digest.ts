/**
 * Daily digest for saved searches set to delivery_mode = "digest".
 *
 * The pipeline still writes every match to user_feed_inbox immediately (so /alerts is always
 * current) but skips the instant email/SMS for digest searches. Once a day (the /api/alerts/process
 * cron) this collects un-digested inbox rows from the last 48h for digest searches with email on,
 * sends ONE email per user, and stamps digest_sent_at so a row is never sent twice.
 * Digest is email-only. Fails soft if the migration isn't applied (missing columns → no-op).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/notifications/email";

const WINDOW_HOURS = 48;
const MAX_PER_EMAIL = 10;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );

export type DigestItem = {
  dealId: string;
  title: string;
  askPrice: number | null;
  location: string;
  searchName: string;
};

export function digestEmailHtml(items: DigestItem[], appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  const shown = items.slice(0, MAX_PER_EMAIL);
  const rows = shown
    .map(
      (i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">
        <a href="${base}/deal/${encodeURIComponent(i.dealId)}" style="font-weight:bold;color:#1e40af">${esc(i.title)}</a><br/>
        <span style="color:#6b7280;font-size:13px">${i.askPrice != null ? `$${Math.round(i.askPrice).toLocaleString()}` : "Price not listed"}${i.location ? ` · ${esc(i.location)}` : ""} · ${esc(i.searchName)}</span>
      </td></tr>`,
    )
    .join("");
  const more =
    items.length > shown.length
      ? `<p style="color:#6b7280">+${items.length - shown.length} more in <a href="${base}/alerts">your alerts</a>.</p>`
      : "";
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
    <h1 style="font-size:20px">Your daily saved-search digest</h1>
    <p>${items.length} new match${items.length === 1 ? "" : "es"} since your last digest. Check the listing and price before you act.</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>${more}
    <p style="margin-top:24px;color:#6b7280;font-size:13px">You get this once a day because these searches are set to Daily digest. <a href="${base}/searches">Change delivery</a>.</p>
  </body></html>`;
}

/** Most inbox rows one user's digest covers (and stamps) per run. */
export const DIGEST_ROWS_PER_USER = 50;

export async function sendSavedSearchDigests(
  sb: SupabaseClient,
): Promise<{ users: number; emailsSent: number; rows: number }> {
  const result = { users: 0, emailsSent: 0, rows: 0 };
  try {
    const { data: searches, error: sErr } = await sb
      .from("user_saved_searches")
      .select("id, user_id, name, notify_email, delivery_mode, is_active")
      .eq("delivery_mode", "digest")
      .eq("is_active", true);
    if (sErr || !searches?.length) return result;
    const emailSearches = searches.filter((s: any) => s.notify_email !== false);
    if (!emailSearches.length) return result;
    // Each inbox row is only shown with a search owned by the same user, so another user's search
    // name can never leak into someone's digest even if search_id were wrong.
    const searchById = new Map<string, { userId: string; name: string }>(
      emailSearches.map((s: any) => [
        s.id,
        { userId: String(s.user_id), name: String(s.name ?? "") },
      ]),
    );

    const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
    const { data: rows, error: rErr } = await sb
      .from("user_feed_inbox")
      .select(
        "id, user_id, search_id, deal_id, deals ( id, year, make, model, ask_price, location_city, location_state )",
      )
      .in("search_id", Array.from(searchById.keys()))
      .is("digest_sent_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (rErr || !rows?.length) return result;

    const byUser = new Map<string, any[]>();
    for (const r of rows as any[]) {
      if (searchById.get(r.search_id)?.userId !== r.user_id) continue;
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      const list = byUser.get(r.user_id)!;
      // Newest first (ORDER BY created_at DESC); rows past the per-user cap stay undigested.
      if (list.length < DIGEST_ROWS_PER_USER) list.push(r);
    }

    let paidOnly: ((uid: string) => Promise<boolean>) | null = null;
    if (process.env.GATING_ENABLED === "true") {
      const { getUserPlan, isPaid } = await import("@/lib/auth/plan");
      paidOnly = async (uid) => isPaid(await getUserPlan(sb as any, uid));
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    for (const [userId, items] of Array.from(byUser.entries())) {
      result.users++;
      if (paidOnly && !(await paidOnly(userId))) continue;
      const { data: auth } = await sb.auth.admin.getUserById(userId);
      const email = auth?.user?.email;
      if (!email) continue;

      const digestItems: DigestItem[] = items.map((r) => ({
        dealId: r.deal_id,
        title:
          [r.deals?.year, r.deals?.make, r.deals?.model]
            .filter(Boolean)
            .join(" ") || "Vehicle match",
        askPrice: r.deals?.ask_price != null ? Number(r.deals.ask_price) : null,
        location: [r.deals?.location_city, r.deals?.location_state]
          .filter(Boolean)
          .join(", "),
        searchName: searchById.get(r.search_id)?.name || "Saved search",
      }));

      const res = await sendEmail({
        to: email,
        subject: `${digestItems.length} new saved-search match${digestItems.length === 1 ? "" : "es"}`,
        html: digestEmailHtml(digestItems, appUrl),
      });
      if (!res.success) continue;
      result.emailsSent++;
      result.rows += items.length;
      await sb
        .from("user_feed_inbox")
        .update({ digest_sent_at: new Date().toISOString() })
        .in(
          "id",
          items.map((r) => r.id),
        );
    }
  } catch (err) {
    console.warn("[digest] saved-search digest failed:", err);
  }
  return result;
}
