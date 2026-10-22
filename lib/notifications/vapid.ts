// The VAPID PUBLIC key — safe to ship to the browser (the server public identity for Web Push).
// Overridable via env. The matching PRIVATE key lives in the locked app_secrets table (or VAPID_PRIVATE_KEY env).
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BHadA8Kdo69aasGI54uD3QGCwIuto8VXSDomNdFrADpEv0H7-xVZ2_qYXItRNbljwT0MS1lDqNozKhrC5QeqpqE";
