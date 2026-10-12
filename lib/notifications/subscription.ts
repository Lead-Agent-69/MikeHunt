import { z } from "zod";

export function isSafePushEndpoint(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    /[\u0000-\u0020\u007f]/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return false;
    const host = url.hostname;
    return (
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host === "push.services.mozilla.com" ||
      host.endsWith(".push.apple.com") ||
      host.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

const subscriptionSchema = z.object({
  endpoint: z.string().refine(isSafePushEndpoint),
  keys: z.object({
    p256dh: z
      .string()
      .max(88)
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .refine((value) => {
        const key = Buffer.from(value, "base64url");
        return key.length === 65 && key[0] === 4;
      }),
    auth: z
      .string()
      .max(24)
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .refine((value) => Buffer.from(value, "base64url").length === 16),
  }),
});

export function parsePushSubscription(value: unknown) {
  const result = subscriptionSchema.safeParse(value);
  return result.success ? result.data : null;
}
