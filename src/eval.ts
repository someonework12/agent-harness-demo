import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generate, MODEL } from "./llm.js";
import { runPipeline } from "./pipeline.js";
import { runChecks, type Check } from "./checks.js";
import { parseJson, prompt } from "./util.js";

/**
 * Eval harness. For each case: run the pipeline, score the page with deterministic checks (50%)
 * and an independent LLM judge (50%), then compare against the saved baseline.
 * The judge never sees the pipeline's own reviewer output, so it cannot just agree with it.
 */

interface Case {
  id: string;
  idea: string;
  keywords: string[];
}

interface Judge {
  faithfulness: number;
  design: number;
  copy: number;
  notes: string;
}

interface CaseResult {
  id: string;
  idea: string;
  ok: boolean;
  error?: string;
  checks: Check[];
  staticScore: number;
  judge: Judge | null;
  judgeScore: number;
  total: number;
  tokens: number;
  ms: number;
}

interface Baseline {
  model: string;
  updatedAt: string;
  cases: Record<string, { total: number; checks: Record<string, boolean> }>;
}

const CASE_DROP_LIMIT = 5;  // a single case losing this many points counts as a regression
const MEAN_DROP_LIMIT = 5; // the mean across cases losing this many points counts as a regression

const args = process.argv.slice(2);
const updateBaseline = args.includes("--update-baseline");
const only = args.find((a) => a.startsWith("--case="))?.slice("--case=".length).split(",");

const casesUrl = new URL("../evals/cases.json", import.meta.url);
const baselineUrl = new URL("../evals/baseline.json", import.meta.url);
const resultsDirUrl = new URL("../evals/results/", import.meta.url);

const allCases = JSON.parse(readFileSync(casesUrl, "utf8")) as Case[];
const cases = only ? allCases.filter((c) => only.includes(c.id)) : allCases;
if (!cases.length) {
  console.error(`No cases matched. Available: ${allCases.map((c) => c.id).join(", ")}`);
  process.exit(1);
}

const baseline: Baseline | null = existsSync(baselineUrl)
  ? (JSON.parse(readFileSync(baselineUrl, "utf8")) as Baseline)
  : null;

async function judgePage(idea: string, html: string): Promise<Judge> {
  const r = await generate({
    tag: "judge",
    system: prompt("judge"),
    user: `IDEA: ${idea}\n\nHTML:\n${html.slice(0, 60_000)}`,
    json: true,
    temperature: 0,
  });
  const j = parseJson<Judge>(r.text);
  const clamp = (n: unknown) => Math.min(5, Math.max(1, Number(n) || 1));
  return { faithfulness: clamp(j.faithfulness), design: clamp(j.design), copy: clamp(j.copy), notes: String(j.notes ?? "") };
}

async function runCase(c: Case): Promise<CaseResult> {
  const start = Date.now();
  try {
    const res = await runPipeline(c.idea, { outRoot: new URL("pages", resultsDirUrl).pathname });
    const checks = runChecks(res.html, c.keywords);
    const staticScore = (checks.filter((k) => k.pass).length / checks.length) * 100;
    const judge = await judgePage(c.idea, res.html);
    const judgeScore = ((judge.faithfulness + judge.design + judge.copy) / 15) * 100;
    return {
      id: c.id,
      idea: c.idea,
      ok: true,
      checks,
      staticScore,
      judge,
      judgeScore,
      total: Math.round(0.5 * staticScore + 0.5 * judgeScore),
      tokens: res.totalTokens,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      id: c.id,
      idea: c.idea,
      ok: false,
      error: String((err as Error).message ?? err),
      checks: [],
      staticScore: 0,
      judge: null,
      judgeScore: 0,
      total: 0,
      tokens: 0,
      ms: Date.now() - start,
    };
  }
}

console.log(`Eval: ${cases.length} case(s), model ${process.env.MOCK_LLM === "1" ? "mock (offline)" : MODEL}`);
console.log(baseline ? `Baseline from ${baseline.updatedAt}\n` : "No baseline yet. Run: npm run eval:baseline\n");

const results: CaseResult[] = [];
for (const c of cases) {
  console.log(`[case ${c.id}] ${c.idea}`);
  const r = await runCase(c);
  results.push(r);
  if (!r.ok) {
    console.log(`  FAILED: ${r.error}\n`);
    continue;
  }
  const passed = r.checks.filter((k) => k.pass).length;
  const failedNames = r.checks.filter((k) => !k.pass).map((k) => k.name);
  console.log(
    `  checks ${passed}/${r.checks.length}  judge F${r.judge!.faithfulness} D${r.judge!.design} C${r.judge!.copy}  total ${r.total}  (${(r.ms / 1000).toFixed(0)}s)`,
  );
  if (failedNames.length) console.log(`  failed checks: ${failedNames.join(", ")}`);
  if (r.judge!.notes) console.log(`  judge: ${r.judge!.notes}`);
  console.log("");
}

mkdirSync(resultsDirUrl, { recursive: true });
writeFileSync(new URL("latest.json", resultsDirUrl), JSON.stringify({ model: MODEL, results }, null, 2));

let regression = false;
if (baseline && !updateBaseline) {
  console.log("Comparison with baseline");
  const deltas: number[] = [];
  for (const r of results) {
    const base = baseline.cases[r.id];
    if (!base) {
      console.log(`  case ${r.id}: no baseline entry`);
      continue;
    }
    const delta = r.total - base.total;
    deltas.push(delta);
    const lostChecks = r.checks.filter((k) => !k.pass && base.checks[k.name] === true).map((k) => k.name);
    const flag = delta <= -CASE_DROP_LIMIT || !r.ok ? "REGRESSION" : "ok";
    if (flag === "REGRESSION") regression = true;
    console.log(
      `  case ${r.id}: ${base.total} -> ${r.total} (${delta >= 0 ? "+" : ""}${delta})  ${flag}` +
        (lostChecks.length ? `  newly failing: ${lostChecks.join(", ")}` : ""),
    );
  }
  if (deltas.length) {
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    console.log(`  mean change: ${mean >= 0 ? "+" : ""}${mean.toFixed(1)}`);
    if (mean <= -MEAN_DROP_LIMIT) regression = true;
  }
  console.log(regression ? "\nRESULT: regression detected" : "\nRESULT: no regression");
}

if (updateBaseline) {
  const next: Baseline = {
    model: MODEL,
    updatedAt: new Date().toISOString(),
    cases: { ...(baseline?.cases ?? {}) },
  };
  for (const r of results) {
    if (!r.ok) continue;
    next.cases[r.id] = { total: r.total, checks: Object.fromEntries(r.checks.map((k) => [k.name, k.pass])) };
  }
  writeFileSync(baselineUrl, JSON.stringify(next, null, 2));
  console.log("Baseline saved to evals/baseline.json");
}

process.exitCode = regression ? 1 : 0;
