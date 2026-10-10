import { fetchPublicHtml } from "@/lib/net/fetch-public-html";
import { createRobotsGate, policyBlockFor } from "./source-compliance";

export function createPoliteHtmlFetcher() {
  const robotsAllowed = createRobotsGate();
  const allowed = async (url: string) =>
    !policyBlockFor(url) && (await robotsAllowed(url));
  return async (url: string): Promise<string> => {
    if (!(await allowed(url)))
      throw new Error("Source policy or robots.txt disallows this page");
    const response = await fetchPublicHtml(url, allowed);
    if (!response)
      throw new Error("Public page unavailable; no challenge bypass attempted");
    if (
      policyBlockFor(response.finalUrl) ||
      !(await robotsAllowed(response.finalUrl))
    )
      throw new Error(
        "Redirect target disallowed by source policy or robots.txt",
      );
    const head = response.html.slice(0, 4000).toLowerCase();
    if (
      /cf-challenge|cf-browser-verification|px-captcha|access denied|are you a human|just a moment/.test(
        head,
      )
    )
      throw new Error("Access challenge detected; no bypass attempted");
    return response.html;
  };
}
