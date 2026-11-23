# AGENTS.md

Instructions for any AI coding agent working in this repo. Humans: this is also the project's design brief.

## What this repo is

A small multi-agent pipeline that turns a one-line idea into a working single-page website, plus an eval harness that scores the output and catches regressions when prompts or code change. Model: Gemini, called only through `src/llm.ts`.

## Commands

- `npm install` once.
- `npm run build-page -- "your idea"` runs the pipeline. Output goes to `output/<slug>/` (index.html, spec.json, review.json, trace.json).
- `npm run serve` previews `output/` on port 4173.
- `npm run eval` runs every case in `evals/cases.json`. `npm run eval -- --case=1,3` runs a subset.
- `npm run eval:baseline` saves the current scores as the baseline in `evals/baseline.json`.
- `npm run typecheck` must pass before any change is considered done.
- `npm run smoke` and `npm run smoke:eval` run the whole harness offline against a mock model. Use them to check wiring without spending API quota.

## Architecture

Pipeline (`src/pipeline.ts`): planner -> builder -> guard -> reviewer -> (one revision if the reviewer says revise).

- planner (`prompts/planner.md`): idea in, JSON spec out.
- builder (`prompts/builder.md`): spec in, one self-contained HTML file out.
- guard (`structuralProblems` in `src/checks.ts`): rejects builder output that breaks the output contract and sends it back once with the exact problems.
- reviewer (`prompts/reviewer.md`): spec + html in, verdict and at most 5 actionable issues out.
- judge (`prompts/judge.md`): used only by the eval harness.

## Context rules (do not break these)

- The planner sees the idea only.
- The builder sees the spec, and on a retry the previous HTML plus a list of issues. It never sees the idea or the planner's raw output.
- The reviewer sees the spec and the HTML.
- The judge sees the idea and the HTML. It never sees the reviewer's verdict. The eval must stay independent of the pipeline it is grading.
- Prompts live in `prompts/*.md` and are read from disk on every call. Do not inline prompts into TypeScript.

## Conventions

- TypeScript strict, ES modules, no extra dependencies unless there is a clear reason.
- Every model call goes through `generate()` in `src/llm.ts`. Do not call the SDK anywhere else.
- Every check in `src/checks.ts` has a short, stable name. Names appear in baselines, so renaming one is a breaking change.
- Keep functions small and single-purpose. Prefer a named check over a clever one.

## Steering rules

- If the builder output drifts from the contract, fix it in the prompt and the guard, not by patching the output.
- When an eval drops, diagnose first: read `evals/results/latest.json` and the failing page in `evals/results/pages/`. Name the cause before changing anything.
- One change per eval run, so a score movement can be attributed to it.
- Never update the baseline to make a regression disappear. Update it only after a change that is intentionally better, and say why.

## Definition of done

- `npm run typecheck` passes.
- `npm run smoke:eval` passes.
- `npm run eval` shows no regression against the baseline, or the baseline was deliberately updated with a stated reason.
- No secrets committed. `.env` stays local.
