import axios from "axios";
import { publicHttpAgent, publicHttpsAgent } from "@/lib/net/fetch-public-html";
import { assertPublicHttpUrl } from "@/lib/net/public-url";
import { assertSourceAccess } from "../access-policy";

/** No implicit redirects: a different URL must pass permission and robots checks independently. */
export async function fetchApprovedPublicResponse(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  assertSourceAccess(undefined, url);
  await assertPublicHttpUrl(url);
  const response = await axios.get(url, {
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    signal: init?.signal || undefined,
    timeout: 30_000,
    maxRedirects: 0,
    maxContentLength: 2 * 1024 * 1024,
    responseType: "text",
    validateStatus: () => true,
    httpAgent: publicHttpAgent,
    httpsAgent: publicHttpsAgent,
  });
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
