// lib/notifications/email.ts
// Email notification system using Resend

import { Resend } from "resend";

// Lazy — `new Resend(undefined)` throws "Missing API key", which would break the build when
// this module is pulled into a route's build-time evaluation. Only construct when a key exists.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email via Resend
 */
export async function sendEmail(options: EmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[Email] Resend API key not configured, skipping email send");
    return { success: false, error: "Resend not configured" };
  }

  try {
    const { data, error } = await getResend().emails.send({
      // Resend rejects a `from` whose domain isn't verified. Set EMAIL_FROM once you verify a
      // domain in Resend; until then the default test sender (onboarding@resend.dev) only
      // delivers to your own Resend account email.
      from:
        options.from ||
        process.env.EMAIL_FROM ||
        "DealerHunt <onboarding@resend.dev>",
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.error("[Email] Failed to send:", error);
      return { success: false, error: error.message };
    }

    console.log("[Email] Sent successfully:", data?.id);
    return { success: true, id: data?.id };
  } catch (error: any) {
    console.error("[Email] Error sending email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send alert match notification email
 */
export async function sendAlertMatchEmail(options: {
  to: string;
  dealerName: string;
  vehicleTitle: string;
  askPrice: number;
  estimatedProfit: number;
  dealUrl: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Deal Match</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            padding: 30px;
            border-radius: 8px 8px 0 0;
            text-align: center;
          }
          .content {
            background: #f9fafb;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .deal-card {
            background: white;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .profit {
            color: #10b981;
            font-size: 24px;
            font-weight: bold;
          }
          .price {
            color: #6b7280;
            font-size: 18px;
          }
          .cta {
            display: inline-block;
            background: #ff385c;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🎯 New Deal Match!</h1>
          <p>A vehicle matching your alert criteria was found</p>
        </div>
        <div class="content">
          <p>Hi ${options.dealerName},</p>
          <p>We found a vehicle that matches your alert preferences:</p>
          
          <div class="deal-card">
            <h2>${options.vehicleTitle}</h2>
            <p class="price">Ask Price: $${options.askPrice.toLocaleString()}</p>
            <p class="profit">Est. Profit: $${options.estimatedProfit.toLocaleString()}</p>
          </div>
          
          <a href="${options.dealUrl}" class="cta">View Full Details</a>
          
          <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
            This is an automated alert from DealerHunt. To manage your alerts, visit your dashboard.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: options.to,
    subject: `🎯 New Deal: ${options.vehicleTitle}`,
    html,
  });
}

/**
 * Send a HomeIQ property-match alert email — N new deals matched a saved search.
 */
export async function sendPropertyMatchEmail(options: {
  to: string;
  searchName: string;
  properties: Array<{
    title: string;
    price?: number | null;
    city?: string | null;
    state?: string | null;
    score: number;
    tier: string;
    mao?: number | null;
    verdict?: string | null;
    capRate?: number | null;
    url: string;
  }>;
  manageUrl: string;
}) {
  const cards = options.properties
    .slice(0, 10)
    .map(
      (p) => `
      <div class="deal-card">
        <h2 style="margin:0 0 6px">${p.title}</h2>
        <p class="price">${p.price != null ? `$${p.price.toLocaleString()}` : ""}${p.city ? ` · ${p.city}, ${p.state || ""}` : ""}</p>
        <p style="margin:6px 0"><span style="background:#0f172a;color:#fff;border-radius:6px;padding:2px 8px;font-weight:bold">${p.tier.toUpperCase()} · ${p.score}</span>
        ${p.mao != null ? ` &nbsp; 🔨 Max offer $${p.mao.toLocaleString()} (${p.verdict})` : ""}
        ${p.capRate != null ? ` &nbsp; 🏦 ${p.capRate}% cap` : ""}</p>
        <a href="${p.url}" class="cta" style="padding:8px 16px;margin-top:8px">View deal</a>
      </div>`,
    )
    .join("");
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px}
      .header{background:linear-gradient(135deg,#0f766e,#2dd4bf);color:#fff;padding:28px;border-radius:8px 8px 0 0;text-align:center}
      .content{background:#f9fafb;padding:24px;border-radius:0 0 8px 8px}
      .deal-card{background:#fff;border:2px solid #e5e7eb;border-radius:8px;padding:16px;margin:14px 0}
      .price{color:#6b7280;font-size:16px;margin:0}
      .cta{display:inline-block;background:#0f766e;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold}
    </style></head><body>
      <div class="header"><h1 style="margin:0">🏠 ${options.properties.length} new deal${options.properties.length > 1 ? "s" : ""} matched</h1>
      <p style="margin:6px 0 0">Saved search: <strong>${options.searchName}</strong></p></div>
      <div class="content">
        ${cards}
        <p style="margin-top:24px;color:#6b7280;font-size:13px">Automated HomeIQ alert. <a href="${options.manageUrl}">Manage your alerts</a>.</p>
      </div>
    </body></html>`;
  return sendEmail({
    to: options.to,
    subject: `🏠 ${options.properties.length} new ${options.searchName} deal${options.properties.length > 1 ? "s" : ""}`,
    html,
  });
}

/**
 * Send price drop notification email
 */
export async function sendPriceDropEmail(options: {
  to: string;
  dealerName: string;
  vehicleTitle: string;
  oldPrice: number;
  newPrice: number;
  priceDrop: number;
  dealUrl: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Price Drop Alert</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
            color: white;
            padding: 30px;
            border-radius: 8px 8px 0 0;
            text-align: center;
          }
          .content {
            background: #f9fafb;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .price-comparison {
            background: white;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
          }
          .old-price {
            text-decoration: line-through;
            color: #9ca3af;
            font-size: 18px;
          }
          .new-price {
            color: #10b981;
            font-size: 28px;
            font-weight: bold;
          }
          .savings {
            color: #059669;
            font-size: 20px;
            font-weight: bold;
            margin-top: 10px;
          }
          .cta {
            display: inline-block;
            background: #10b981;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📉 Price Drop Alert!</h1>
          <p>A vehicle on your watchlist just dropped in price</p>
        </div>
        <div class="content">
          <p>Hi ${options.dealerName},</p>
          <p>Great news! The price dropped on a vehicle you're watching:</p>
          
          <div class="price-comparison">
            <h2>${options.vehicleTitle}</h2>
            <p class="old-price">Was: $${options.oldPrice.toLocaleString()}</p>
            <p class="new-price">Now: $${options.newPrice.toLocaleString()}</p>
            <p class="savings">You save: $${options.priceDrop.toLocaleString()}</p>
          </div>
          
          <a href="${options.dealUrl}" class="cta">View Deal Now</a>
          
          <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
            This is an automated alert from DealerHunt. To manage your watchlist, visit your dashboard.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: options.to,
    subject: `📉 Price Drop: ${options.vehicleTitle} - Save $${options.priceDrop.toLocaleString()}`,
    html,
  });
}

/**
 * Send auction ending soon notification
 */
export async function sendAuctionEndingEmail(options: {
  to: string;
  dealerName: string;
  vehicleTitle: string;
  currentBid: number;
  endsAt: string;
  dealUrl: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Auction Ending Soon</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
            color: white;
            padding: 30px;
            border-radius: 8px 8px 0 0;
            text-align: center;
          }
          .content {
            background: #f9fafb;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .auction-card {
            background: white;
            border: 2px solid #fbbf24;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .current-bid {
            color: #f59e0b;
            font-size: 24px;
            font-weight: bold;
          }
          .time-left {
            color: #dc2626;
            font-size: 18px;
            font-weight: bold;
          }
          .cta {
            display: inline-block;
            background: #f59e0b;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>⏰ Auction Ending Soon!</h1>
          <p>Don't miss out on this opportunity</p>
        </div>
        <div class="content">
          <p>Hi ${options.dealerName},</p>
          <p>An auction you're watching is ending soon:</p>
          
          <div class="auction-card">
            <h2>${options.vehicleTitle}</h2>
            <p class="current-bid">Current Bid: $${options.currentBid.toLocaleString()}</p>
            <p class="time-left">Ends: ${options.endsAt}</p>
          </div>
          
          <a href="${options.dealUrl}" class="cta">Place Your Bid</a>
          
          <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
            This is an automated alert from DealerHunt. To manage your watchlist, visit your dashboard.
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: options.to,
    subject: `⏰ Auction Ending Soon: ${options.vehicleTitle}`,
    html,
  });
}
