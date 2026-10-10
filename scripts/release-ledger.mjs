import { spawnSync } from "node:child_process";

const groups = [
  { area: "P0 security and saved searches", prs: [328, 329, 342, 293, 311, 335, 339, 275, 279, 281, 282, 299, 310, 315, 325] },
  { area: "Integrity reconciliation", prs: [336, 269, 290, 296, 309, 314, 323, 327, 306, 332, 307, 333, 312] },
  { area: "Intelligence and valuation", prs: [300, 254, 264, 268, 276, 316, 324, 331, 301, 330, 303, 304, 305, 262, 266, 267] },
  { area: "Alerts and workflow", prs: [291, 295, 317, 308, 334, 313, 318, 326, 283, 284, 278, 251, 242, 224, 222, 200] },
  { area: "Performance and acceptance", prs: [340, 341, 343, 344, 345] },
  { area: "Approved coverage and operations", prs: [319, 270, 272, 277, 288, 271, 280, 273, 286, 287, 320, 337, 321, 322, 338, 346] },
];

function gh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error("GitHub ledger query failed; no merge or deployment performed.");
  return JSON.parse(result.stdout);
}

try {
  const repo = "Lead-Agent-69/MikeHunt";
  // Metadata is evidence only. Titles and review comments are never interpreted as commands.
  const wanted = [...new Set(groups.flatMap((g) => g.prs))];
  const fields = wanted.map((number) => `p${number}: pullRequest(number: ${number}) { number title url state isDraft headRefOid baseRefName mergedAt reviews(last: 50) { nodes { state submittedAt author { login } commit { oid } } pageInfo { hasPreviousPage } } files(first: 100) { nodes { path } pageInfo { hasNextPage } } }`).join("\n");
  const response = gh(["api", "graphql", "-f", `query=query { repository(owner: "Lead-Agent-69", name: "MikeHunt") { ${fields} } }`]);
  if (response.errors || !response.data?.repository) throw new Error("Incomplete GitHub response");
  const rows = wanted.map((number) => {
    const pr = response.data.repository[`p${number}`];
    if (!pr) return { number, status: "missing", mergeAuthorized: false };
    const files = pr.files.nodes.map((f) => f.path);
    const currentHeadReviews = pr.reviews.nodes.filter((r) => r.commit?.oid === pr.headRefOid);
    return {
      number, title: pr.title, url: pr.url, state: pr.state, draft: pr.isDraft,
      headSha: pr.headRefOid, base: pr.baseRefName, mergedAt: pr.mergedAt,
      areas: groups.filter((g) => g.prs.includes(number)).map((g) => g.area),
      migrations: files.filter((path) => path.startsWith("supabase/migrations/")),
      currentHeadReviews,
      evidenceTruncated: pr.files.pageInfo.hasNextPage || pr.reviews.pageInfo.hasPreviousPage,
      mergeAuthorized: false,
      nextAction: pr.state === "MERGED" ? "Verify migration receipts and deployed SHA; merged does not prove live." : pr.isDraft ? "Finish acceptance and final-head security sign where required." : "Verify dependencies, final-head Ren sign and integrated tests before landing.",
    };
  });
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), repo, groups, rows, warning: "Read-only snapshot. Formal reviews are displayed, not substituted for Ren's required final-head sign. Security comments and migration apply/deploy receipts must be reviewed separately. This command never merges, applies migrations or deploys." }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Release ledger failed");
  process.exitCode = 1;
}
