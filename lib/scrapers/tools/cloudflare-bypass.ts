import { retiredBypass } from "../retired";

/** Retired: MikeHunt never bypasses Cloudflare or any other bot protection. */
export async function fetchWithCloudflareBypass(url: string): Promise<string> {
  void url;
  return retiredBypass("cloudflare-bypass");
}
