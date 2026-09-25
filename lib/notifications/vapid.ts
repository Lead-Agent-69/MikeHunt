// The VAPID PUBLIC key — safe to ship to the browser (the server public identity for Web Push).
// Overridable via env. The matching PRIVATE key lives in the locked app_secrets table (or VAPID_PRIVATE_KEY env).
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BFdgrsRmLC0obx05qPGr_zVtKoSSYfl-KQmvPWZDi4TZBtkaT6IPJ3-7k1myWu0A01jO4YRSbdLVKgp9F0sO6Cc";
