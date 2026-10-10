import React from "react";
import type { Metadata } from "next";
import { PublicLayout } from "@/components/layout/PublicLayout";

export const metadata: Metadata = {
  title: "MikeHuntBot | MikeHunt",
  description:
    "What MikeHuntBot is, how it crawls, and how to limit or block it.",
};

const RULES = [
  "We identify ourselves on every request as MikeHuntBot/1.0 with a link to this page. We never pretend to be a browser, rotate identities, or use proxies.",
  "We read robots.txt before crawling and follow Disallow and Crawl-delay.",
  "We send at most one or two requests at a time to a site, with a pause of a few seconds between them.",
  "We ask whether a page changed (ETag / If-Modified-Since) and skip it when it didn't.",
  "If a site answers 429 or 503 we slow down and honor Retry-After. Repeated 403 or 429 responses, or any bot check, pause the whole site for hours. We never try to get around a block, captcha or login.",
  "We only read public vehicle listings, and we link back to the seller's page.",
];

export default function BotPage() {
  const contact = process.env.BOT_CONTACT_EMAIL;
  return (
    <PublicLayout
      title="MikeHuntBot"
      description="How our crawler behaves and how to control it."
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
        <div className="glass-panel p-8 space-y-4">
          <h2 className="text-xl font-bold text-[var(--t1)]">How we crawl</h2>
          <ul className="list-disc pl-5 space-y-2 text-[var(--t3)]">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
        <div className="glass-panel p-8 space-y-3">
          <h2 className="text-xl font-bold text-[var(--t1)]">
            Limit or block us
          </h2>
          <p className="text-[var(--t3)]">
            Add this to your robots.txt to block us completely:
          </p>
          <pre className="text-sm bg-[var(--bg2,#111)] p-3 rounded-lg overflow-x-auto">
            {"User-agent: MikeHuntBot\nDisallow: /"}
          </pre>
          <p className="text-[var(--t3)]">
            Or use Crawl-delay to slow us down. Changes apply on our next crawl.
            If you would rather send us a feed of your inventory, we'd welcome
            it.
          </p>
          {contact && (
            <p className="text-[var(--t3)]">
              Contact:{" "}
              <a className="underline" href={`mailto:${contact}`}>
                {contact}
              </a>
            </p>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
