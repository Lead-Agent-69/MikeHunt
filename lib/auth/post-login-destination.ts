import { safeNextPath } from "./safe-next-path";

export function postLoginDestination(onboarded: boolean, requested: string) {
  const next = safeNextPath(requested);
  const pathname = new URL(next, "https://mikehunt.invalid").pathname;
  if (pathname === "/onboarding") return onboarded ? "/discover" : next;
  if (onboarded) return next;
  return next === "/discover"
    ? "/onboarding"
    : `/onboarding?next=${encodeURIComponent(next)}`;
}
