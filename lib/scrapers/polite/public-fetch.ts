import axios from "axios";
import { pinnedAxiosOptions, resolvePinnedTarget } from "@/lib/net/pinned-dns";
import { assertPublicHttpUrl } from "@/lib/net/public-url";
import { assertSourceAccess } from "../access-policy";
import { withSharedHost, pauseSharedHost } from "./shared-host-gate";

/** No implicit redirects: a different URL must pass permission and robots checks independently. */
export async function fetchApprovedPublicResponse(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  assertSourceAccess(undefined, url);
  await assertPublicHttpUrl(url);
  const target = await resolvePinnedTarget(url);
  const host = new URL(url).hostname;
  const response = await withSharedHost(host, 5000, () =>
    axios.get(url, {
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      signal: init?.signal || undefined,
      timeout: 30_000,
      maxRedirects: 0,
      maxContentLength: 2 * 1024 * 1024,
      responseType: "text",
      validateStatus: () => true,
      ...pinnedAxiosOptions(target),
    }),
  );
  if ([401, 403, 429].includes(response.status))
    await pauseSharedHost(host, 6 * 60 * 60_000);
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (
      typeof value === "string" &&
      !["set-cookie", "content-encoding", "content-length"].includes(
        key.toLowerCase(),
      )
    )
      headers.set(key, value);
  }
  return new Response(
    [204, 205, 304].includes(response.status) ? null : response.data,
    { status: response.status, headers },
  );
}
