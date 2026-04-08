#!/usr/bin/env node
// 02_triage.js — AI triage via Claude API
// Usage: node 02_triage.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const BACKLOG_FILE = path.join(DATA_DIR, "backlog.json");

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(1); }

const PM = {
  security: 1, crash: 2, "data-loss": 2, bug: 3, performance: 4,
  feature: 5, enhancement: 5, documentation: 6, i18n: 7, translation: 7, chore: 8,
};

const SYS = [
  "You are a senior engineer triaging a GitHub backlog for Focalboard.",
  "Respond ONLY with a valid JSON object — no markdown fences, no explanation.",
  "Fields: category(security|crash|data-loss|bug|performance|feature|documentation|i18n|chore),",
  "priority(1-8), complexity(trivial|small|medium|large|unknown),",
  "auto_attempt(bool), skip_reason(str|null), affected_area(backend|frontend|desktop|i18n|docs|ci|unknown),",
  "summary(str), test_hint(str|null).",
  "auto_attempt=false for: security(always), large/unknown, no repro steps, UI decisions.",
  "auto_attempt=true for: trivial/small bugs, i18n files, docs, small features with clear specs.",
].join("\n");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(content) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: SYS,
      messages: [{ role: "user", content }],
    }),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  const d = await r.json();
  let text = d.content[0].text.trim();
  // Strip markdown fences if present — done with string ops, no regex needed
  if (text.startsWith("```")) {
    text = text.slice(text.indexOf("\n") + 1);
    if (text.endsWith("```")) text = text.slice(0, text.lastIndexOf("```"));
    text = text.trim();
  }
  return JSON.parse(text);
}

async function triageItems(items, type) {
  const out = [];
  console.log(`\nTriaging ${items.length} ${type}s...`);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    process.stdout.write(`  [${i + 1}/${items.length}] #${item.number} ${item.title.substring(0, 55)}...`);
    const prompt = [
      `${type.toUpperCase()} #${item.number}`,
      `Title: ${item.title}`,
      `Labels: ${(item.labels || []).join(", ") || "none"}`,
      `Body:\n${(item.body || "No description.").substring(0, 2000)}`,
    ].join("\n");
    let triage;
    let attempts = 0;
    while (attempts < 3) {
      try {
        triage = await ask(prompt);
        break;
      } catch (e) {
        attempts++;
        if (attempts === 3) {
          triage = {
            category: "unknown", priority: 9, complexity: "unknown",
            auto_attempt: false, skip_reason: `Triage failed: ${e.message}`,
            affected_area: "unknown", summary: item.title, test_hint: null,
          };
        } else {
          await sleep(2000 * attempts);
        }
      }
    }
    triage.priority = Math.min(triage.priority, PM[triage.category] ?? 9);
    out.push({
      ...item, type, triage,
      status: "open", assigned_to: null, fork_issue_number: null,
      attempts: 0, last_attempt: null,
    });
    process.stdout.write(` ✓ [${triage.category}/${triage.complexity}] auto=${triage.auto_attempt}\n`);
    await sleep(350);
  }
  return out;
}

async function main() {
  const issues = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "issues_raw.json"), "utf8"));
  const prs    = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "prs_raw.json"),    "utf8"));
  console.log(`Loaded ${issues.length} issues, ${prs.length} PRs`);

  const all = [
    ...(await triageItems(issues, "issue")),
    ...(await triageItems(prs, "pr")),
  ];

  const co = { trivial: 0, small: 1, medium: 2, large: 3, unknown: 4 };
  all.sort((a, b) =>
    a.triage.priority !== b.triage.priority
      ? a.triage.priority - b.triage.priority
      : (co[a.triage.complexity] ?? 4) - (co[b.triage.complexity] ?? 4)
  );

  fs.writeFileSync(BACKLOG_FILE, JSON.stringify(all, null, 2));

  const cats = {};
  for (const i of all) {
    cats[i.triage.category] = cats[i.triage.category] || { total: 0, auto: 0 };
    cats[i.triage.category].total++;
    if (i.triage.auto_attempt) cats[i.triage.category].auto++;
  }
  console.log("\n=== Triage Summary ===");
  console.log(`${"Category".padEnd(18)} ${"Total".padStart(6)} ${"Auto".padStart(6)}`);
  console.log("-".repeat(34));
  for (const [c, v] of Object.entries(cats).sort((a, b) => (PM[a[0]] ?? 9) - (PM[b[0]] ?? 9)))
    console.log(`${c.padEnd(18)} ${String(v.total).padStart(6)} ${String(v.auto).padStart(6)}`);
  console.log(`\nBacklog written to: ${BACKLOG_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
