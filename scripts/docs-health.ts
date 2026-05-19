#!/usr/bin/env node
// docs-health.ts — generate docs/HEALTH.md from git log + filesystem scan.
// Run via: pnpm docs:health  (alias for: tsx scripts/docs-health.ts)
//
// No external services, no API calls. Pure git + fs.

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ""));
const DOCS_DIR = join(REPO_ROOT, "docs");
const OUT_FILE = join(DOCS_DIR, "HEALTH.md");
const WINDOW_DAYS = 7;

type DocStatus = {
  path: string;
  type: string;
  frontmatterUpdated: string | null;
  lastCommitISO: string | null;
  daysSinceUpdated: number | null;
  daysSinceCommit: number | null;
};

type LinkProbe = {
  file: string;
  target: string;
  exists: boolean;
};

function walkMarkdown(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function gitLastCommit(file: string): string | null {
  try {
    const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
    const out = execSync(`git log -1 --format=%cI -- "${rel}"`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

function inspectDocs(): DocStatus[] {
  return walkMarkdown(DOCS_DIR).map((path) => {
    const rel = relative(REPO_ROOT, path).replace(/\\/g, "/");
    const content = readFileSync(path, "utf8");
    const fm = parseFrontmatter(content);
    const last = gitLastCommit(path);
    return {
      path: rel,
      type: fm.type ?? "—",
      frontmatterUpdated: fm.updated ?? null,
      lastCommitISO: last,
      daysSinceUpdated: daysBetween(fm.updated ?? null),
      daysSinceCommit: daysBetween(last),
    };
  });
}

function probeLinks(files: string[]): LinkProbe[] {
  const probes: LinkProbe[] = [];
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const fileDir = dirname(file);
    for (const m of content.matchAll(linkRe)) {
      const target = m[1].split("#")[0];
      if (!target || target.startsWith("http") || target.startsWith("mailto:")) continue;
      const resolved = resolve(fileDir, target);
      let exists = true;
      try {
        statSync(resolved);
      } catch {
        exists = false;
      }
      probes.push({
        file: relative(REPO_ROOT, file).replace(/\\/g, "/"),
        target,
        exists,
      });
    }
  }
  return probes;
}

function commitRatio(): { apps: number; docs: number; ratio: string } {
  let raw = "";
  try {
    raw = execSync(
      `git log --since="${WINDOW_DAYS} days ago" --pretty=format: --name-only`,
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
  } catch {
    return { apps: 0, docs: 0, ratio: "n/a (git unavailable)" };
  }
  const lines = raw.split("\n").filter(Boolean);
  let apps = 0;
  let docs = 0;
  for (const line of lines) {
    if (line.startsWith("apps/")) apps++;
    else if (line.startsWith("docs/")) docs++;
  }
  const ratio = docs === 0 ? `${apps}:0 (no doc commits)` : `${apps}:${docs} = ${(apps / docs).toFixed(2)}`;
  return { apps, docs, ratio };
}

function renderTable(headers: string[], rows: string[][]): string {
  const out: string[] = [];
  out.push(`| ${headers.join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) out.push(`| ${row.join(" | ")} |`);
  return out.join("\n");
}

function main(): void {
  const docs = inspectDocs();
  const files = walkMarkdown(DOCS_DIR);
  const links = probeLinks(files);
  const ratio = commitRatio();

  const broken = links.filter((l) => !l.exists);
  const today = new Date().toISOString().slice(0, 10);

  const freshnessRows = docs
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((d) => [
      d.path,
      d.type,
      d.frontmatterUpdated ?? "—",
      d.lastCommitISO?.slice(0, 10) ?? "—",
      d.daysSinceUpdated !== null ? String(d.daysSinceUpdated) : "—",
      d.daysSinceCommit !== null ? String(d.daysSinceCommit) : "—",
    ]);

  const brokenRows =
    broken.length === 0
      ? [["—", "—", "no broken links detected"]]
      : broken.map((b) => [b.file, b.target, "missing"]);

  const out = `---
type: reference
updated: ${today}
status: auto-generated
---

# Documentation health

Generated by \`pnpm docs:health\` on ${today}. Read-only telemetry — do not hand-edit.

## Preamble — observation window

This file is the data source for the future doc-maintenance policy. **No formal cadence, ownership, or update rule is authored until 2026-07-18** (60 days from doc-bootstrap dispatch, 2026-05-19). Until then, this page just observes — every \`pnpm docs:health\` run overwrites it. Policy authoring happens once we have a baseline.

## Commit ratio — last ${WINDOW_DAYS} days

\`apps/*\` commit touches vs \`docs/*\` commit touches in the last ${WINDOW_DAYS} days:

- \`apps/*\`: **${ratio.apps}** file-touches
- \`docs/*\`: **${ratio.docs}** file-touches
- Ratio: **${ratio.ratio}**

Reading: a high ratio with low absolute doc touches = drift risk rising. A zero in either column = signal to investigate (no work in that surface, or no doc updates despite code work).

## Broken links

${renderTable(["File", "Target", "Status"], brokenRows)}

## Per-page freshness

\`updated\` = frontmatter \`updated:\` field. \`last commit\` = last \`git log\` commit date for the file. Δ days from today.

${renderTable(
    ["Path", "Type", "Updated (fm)", "Last commit", "Δ updated", "Δ commit"],
    freshnessRows,
  )}

## Reading the table

- **Δ updated**: days since the page declared itself fresh. > 90 = candidate for review.
- **Δ commit**: days since git last touched the file. Sharp gap vs Δ updated = forgotten frontmatter or untouched page.
- **Type = —**: missing frontmatter → fix before next audit.

## Next steps

After 2026-07-18, consume this telemetry to author a real maintenance policy: cadence, ownership, hooks. See \`docs/AUDIT-2026-05-19.md\` recommendations § 4.
`;

  writeFileSync(OUT_FILE, out, "utf8");
  console.log(`docs-health: wrote ${relative(REPO_ROOT, OUT_FILE).replace(/\\/g, "/")}`);
  console.log(`docs-health: ${docs.length} docs scanned, ${broken.length} broken links`);
}

main();
