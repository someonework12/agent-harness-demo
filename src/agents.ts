import { generate } from "./llm.js";
import { parseJson, prompt, slugify, stripFences } from "./util.js";
import type { BuildFeedback, Review, Spec, Timed } from "./types.js";

/**
 * Context rules (see AGENTS.md):
 *  - planner sees the idea only
 *  - builder sees the spec (plus feedback on a retry), never the planner's raw output or the idea
 *  - reviewer sees spec + html
 */

export async function plan(idea: string): Promise<Timed<Spec>> {
  const r = await generate({
    tag: "planner",
    system: prompt("planner"),
    user: `Idea: ${idea}`,
    json: true,
    temperature: 0.6,
  });
  const spec = parseJson<Spec>(r.text);
  spec.sections = (spec.sections ?? []).map((s) => ({ ...s, id: s.id ? slugify(s.id) : slugify(s.heading) }));
  if (spec.sections.length < 3) throw new Error("Planner returned fewer than 3 sections");
  return { value: spec, ms: r.ms, tokens: r.tokens };
}

export async function build(spec: Spec, feedback?: BuildFeedback): Promise<Timed<string>> {
  let user = `SPEC:\n${JSON.stringify(spec, null, 2)}`;
  if (feedback) {
    user +=
      `\n\nPREVIOUS HTML:\n${feedback.previousHtml}` +
      `\n\nFEEDBACK TO FIX (address every item, keep what already works):\n` +
      feedback.issues.map((i) => `- ${i}`).join("\n");
  }
  const r = await generate({ tag: "builder", system: prompt("builder"), user, temperature: 0.7 });
  return { value: stripFences(r.text), ms: r.ms, tokens: r.tokens };
}

export async function review(spec: Spec, html: string): Promise<Timed<Review>> {
  const r = await generate({
    tag: "reviewer",
    system: prompt("reviewer"),
    user: `SPEC:\n${JSON.stringify(spec, null, 2)}\n\nHTML:\n${html}`,
    json: true,
    temperature: 0.2,
  });
  const raw = parseJson<Partial<Review>>(r.text);
  const verdict: Review["verdict"] = raw.verdict === "pass" ? "pass" : "revise";
  const issues = Array.isArray(raw.issues) ? raw.issues.map(String).slice(0, 5) : [];
  return { value: { verdict, score: Number(raw.score ?? 0), issues }, ms: r.ms, tokens: r.tokens };
}
