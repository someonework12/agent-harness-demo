import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, plan, review } from "./agents.js";
import { structuralProblems } from "./checks.js";
import { slugify } from "./util.js";
import type { BuildFeedback, PipelineResult, Spec, Step } from "./types.js";

const MAX_REVISIONS = 1;

export interface PipelineOptions {
  outRoot?: string;
  log?: boolean;
}

export async function runPipeline(idea: string, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const log = opts.log ? (m: string) => console.log(m) : () => {};
  const steps: Step[] = [];
  const t0 = Date.now();

  /** Build with a guard: if the builder drifts from the output contract, reject and retry once. */
  async function buildGuarded(spec: Spec, feedback: BuildFeedback | undefined, attempt: number): Promise<string> {
    let fb = feedback;
    for (let tries = 1; tries <= 2; tries++) {
      log(`[builder] ${fb ? "revising" : "writing"} page (attempt ${attempt}.${tries})`);
      const b = await build(spec, fb);
      const problems = structuralProblems(b.value);
      steps.push({
        agent: "builder",
        attempt,
        ms: b.ms,
        tokens: b.tokens,
        note: problems.length ? `guard rejected: ${problems.join("; ")}` : "guard ok",
      });
      if (!problems.length) return b.value;
      log(`[guard] builder drifted: ${problems.join("; ")} -> sending it back`);
      fb = { previousHtml: b.value, issues: problems };
    }
    throw new Error("Builder failed the structural guard twice");
  }

  log("[planner] drafting spec");
  const planned = await plan(idea);
  steps.push({ agent: "planner", attempt: 1, ms: planned.ms, tokens: planned.tokens });
  const spec = planned.value;
  log(`[planner] "${spec.title}" with ${spec.sections.length} sections`);

  let html = await buildGuarded(spec, undefined, 1);

  log("[reviewer] reviewing");
  const reviewed = await review(spec, html);
  steps.push({ agent: "reviewer", attempt: 1, ms: reviewed.ms, tokens: reviewed.tokens, note: reviewed.value.verdict });
  const finalReview = reviewed.value;
  log(`[reviewer] ${finalReview.verdict} (score ${finalReview.score}/10)`);

  let revised = false;
  for (let i = 0; i < MAX_REVISIONS && finalReview.verdict === "revise"; i++) {
    log(`[reviewer] issues: ${finalReview.issues.join(" | ")}`);
    html = await buildGuarded(spec, { previousHtml: html, issues: finalReview.issues }, i + 2);
    revised = true;
  }

  const slug = slugify(idea);
  const dir = join(opts.outRoot ?? "output", slug);
  mkdirSync(dir, { recursive: true });
  const totalMs = Date.now() - t0;
  const totalTokens = steps.reduce((n, s) => n + s.tokens, 0);

  writeFileSync(join(dir, "index.html"), html);
  writeFileSync(join(dir, "spec.json"), JSON.stringify(spec, null, 2));
  writeFileSync(join(dir, "review.json"), JSON.stringify(finalReview, null, 2));
  writeFileSync(join(dir, "trace.json"), JSON.stringify({ idea, revised, totalMs, totalTokens, steps }, null, 2));

  return { idea, slug, dir, spec, review: finalReview, html, steps, revised, totalMs, totalTokens };
}
