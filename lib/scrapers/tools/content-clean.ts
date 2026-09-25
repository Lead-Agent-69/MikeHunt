import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

// Generic main-content extractor — a TypeScript/Cheerio port of Crawl4AI's PruningContentFilter. It strips
// nav / footer / ads / boilerplate by recursively scoring DOM nodes on text-density, link-density, tag
// weight, and negative class/id hints, then dropping low-scoring subtrees. This gives us a "clean ANY page
// down to its real content" primitive — the foundation for adding sources WITHOUT a bespoke parser, and for
// feeding dense, noise-free text to the LLM. Cheerio-only, no new deps.
//
// Algorithm + weights ported from crawl4ai/content_filter_strategy.py (PruningContentFilter).

const W = {
  textDensity: 0.4,
  linkDensity: 0.2,
  tagWeight: 0.2,
  classId: 0.1,
  textLength: 0.1,
};
const WSUM =
  W.textDensity + W.linkDensity + W.tagWeight + W.classId + W.textLength;

// Structural tags that tend to hold real content score higher; chrome/wrappers score low.
const TAG_W: Record<string, number> = {
  article: 1.5,
  main: 1.4,
  section: 1.0,
  p: 1.0,
  h1: 1.2,
  h2: 1.1,
  h3: 1.0,
  h4: 0.9,
  h5: 0.8,
  h6: 0.7,
  table: 0.8,
  td: 0.7,
  li: 0.5,
  ul: 0.5,
  ol: 0.5,
  div: 0.5,
  span: 0.3,
};
const NEG =
  /nav|footer|header|sidebar|ads?\b|advert|comment|promo|social|share|cookie|banner|menu|modal|popup|newsletter|subscribe/i;
const DROP = [
  "nav",
  "footer",
  "header",
  "aside",
  "script",
  "style",
  "form",
  "iframe",
  "noscript",
  "svg",
];

const isTag = (n: AnyNode): n is Element => n.type === "tag";

function scoreNode($: cheerio.CheerioAPI, el: Element): number {
  const $el = $(el);
  const text = $el.text().replace(/\s+/g, " ").trim();
  const textLen = text.length;
  const tagLen = ($.html(el) || "").length || 1;
  let linkLen = 0;
  $el.children("a").each((_i, a) => {
    linkLen += $(a).text().trim().length;
  });
  const textDensity = textLen / tagLen; // text-to-markup ratio
  const linkDensity = 1 - (textLen ? linkLen / textLen : 0); // penalize link-heavy nav/menus
  const tagW = TAG_W[el.name] ?? 0.5;
  const cid = `${$el.attr("class") || ""} ${$el.attr("id") || ""}`;
  const classId = NEG.test(cid) ? -0.5 : 0;
  const num =
    W.textDensity * textDensity +
    W.linkDensity * linkDensity +
    W.tagWeight * tagW +
    W.classId * Math.max(0, classId) +
    W.textLength * Math.log(textLen + 1);
  return num / WSUM;
}

// Top-down keep-or-kill recursion: a low-scoring container is dropped whole (taking its junk children with
// it); a kept container has its children individually re-evaluated. Fast + effective.
function prune($: cheerio.CheerioAPI, el: Element, threshold: number): void {
  const cid = `${$(el).attr("class") || ""} ${$(el).attr("id") || ""}`;
  if (NEG.test(cid) || scoreNode($, el) < threshold) {
    $(el).remove();
    return;
  }
  $(el)
    .children()
    .toArray()
    .forEach((c) => {
      if (isTag(c)) prune($, c, threshold);
    });
}

/** Clean HTML down to its main content — nav/footer/ads/boilerplate removed. */
export function fitHtml(html: string, threshold = 0.4): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("*")
    .contents()
    .filter((_i, n) => n.type === "comment")
    .remove();
  DROP.forEach((t) => $(t).remove());
  // cheerio.load always wraps fragments in <html><body>…</body></html>, so <body> is always the container.
  const body = $("body");
  body
    .children()
    .toArray()
    .forEach((c) => {
      if (isTag(c)) prune($, c, threshold);
    });
  return body.html() || "";
}

/** Clean, dense plain text of a page's main content — ready for the LLM or a regex sweep. */
export function fitText(html: string, threshold = 0.4): string {
  if (!html) return "";
  const $ = cheerio.load(fitHtml(html, threshold));
  return $.root()
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
