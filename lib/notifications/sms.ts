// lib/notifications/sms.ts
// SMS notification system using Twilio

import twilio from "twilio";

let twilioClient: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (
    !twilioClient &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN
  ) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
  }
  return twilioClient;
}

export interface SMSOptions {
  to: string;
  message: string;
}

/**
 * Send an SMS via Twilio
 */
export async function sendSMS(options: SMSOptions) {
  const client = getTwilioClient();

  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.warn("[SMS] Twilio not configured, skipping SMS send");
    return { success: false, error: "Twilio not configured" };
  }

  try {
    const message = await client.messages.create({
      body: options.message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: options.to,
    });

    console.log("[SMS] Sent successfully:", message.sid);
    return { success: true, sid: message.sid };
  } catch (error: any) {
    console.error("[SMS] Error sending SMS:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send alert match SMS notification
 */
export async function sendAlertMatchSMS(options: {
  to: string;
  vehicleTitle: string;
  askPrice: number;
  estimatedProfit: number;
  dealUrl: string;
}) {
  const message = `🎯 DealerHunt Alert: ${options.vehicleTitle} - $${options.askPrice.toLocaleString()} (Est. Profit: $${options.estimatedProfit.toLocaleString()}). View: ${options.dealUrl}`;

  return sendSMS({
    to: options.to,
    message,
  });
}

/**
 * Send price drop SMS notification
 */
export async function sendPriceDropSMS(options: {
  to: string;
  vehicleTitle: string;
  newPrice: number;
  priceDrop: number;
  dealUrl: string;
}) {
  const message = `📉 Price Drop: ${options.vehicleTitle} now $${options.newPrice.toLocaleString()} (Save $${options.priceDrop.toLocaleString()}). View: ${options.dealUrl}`;

  return sendSMS({
    to: options.to,
    message,
  });
}

/**
 * Send auction ending SMS notification
 */
export async function sendAuctionEndingSMS(options: {
  to: string;
  vehicleTitle: string;
  currentBid: number;
  hoursLeft: number;
  dealUrl: string;
}) {
  const message = `⏰ Auction Ending: ${options.vehicleTitle} - Current bid: $${options.currentBid.toLocaleString()}. ${options.hoursLeft}h left. Bid: ${options.dealUrl}`;

  return sendSMS({
    to: options.to,
    message,
  });
}
