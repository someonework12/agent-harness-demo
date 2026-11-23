# agent-harness-demo

A planner / builder / reviewer agent pipeline that turns a one-line idea into a working page, with a guard that catches builder drift and an eval harness that catches regressions. Runs on the Gemini API (free tier is enough).

## Setup

```bash
npm install
cp .env.example .env     # then paste your Gemini key into GEMINI_API_KEY
npm run typecheck
npm run smoke            # offline check, no API calls
```

Settings in `.env`:

- `GEMINI_API_KEY`: from Google AI Studio.
- `GEMINI_MODEL`: defaults to `gemini-2.5-flash`. If the API says the model is not found, change this to a current Flash model.
- `LLM_MIN_INTERVAL_MS`: gap between model calls, default 6500, to stay inside free-tier rate limits. Lower it if your quota allows.

## Use

```bash
npm run build-page -- "a landing page for a neighborhood tool-lending library"
npm run serve            # open the forwarded port 4173
npm run eval:baseline    # save the first baseline (about 5 to 8 minutes for all 5 cases)
npm run eval             # compare against the baseline later
npm run eval -- --case=1,2   # quicker, for demos
```

## Recording run-sheet (about 35 minutes, one take)

The brief says to build something while you record. This repo is your starting point, not the thing you build live. Say so at the start, then build one real extension on camera.

1. 0:00 to 3:00. Who you are, one sentence. Show `AGENTS.md`, the `prompts/` folder and the pipeline in `src/pipeline.ts`. Say why the context rules exist.
2. 3:00 to 8:00. Run `npm run build-page` on an idea of your own. Open `trace.json`, then the page. Point out what is weak. This sets up the live task.
3. 8:00 to 25:00. Build ONE extension live with your AI coding tool. Pick one:
   - an accessibility auditor agent whose findings feed the reviewer
   - a new eval check plus a new test case in `evals/cases.json`
   - a token budget guard that stops the pipeline when a run costs too much
   Say your plan first. Set the task for the AI, let it drift once on purpose or by accident, catch it, correct it, and say why you decided it was good enough.
4. 25:00 to 32:00. Run `npm run eval:baseline`. Then break one line in `prompts/builder.md` (for example delete the responsive requirement), run `npm run eval -- --case=1,2`, and show the harness flag the regression and name the failing check. Revert the line.
5. 32:00 to 38:00. Deploy the generated page: `npx netlify-cli deploy --dir=output/<slug> --prod`. Open the live URL. Finish with what you would do next.

Practice the flow twice before recording. Make the screen text large and the audio clear, and leave `AGENTS.md` and your tool config visible at some point.

## Layout

```
AGENTS.md            the Agent MD: architecture, context rules, definition of done
prompts/             one prompt file per agent, read from disk on every call
src/llm.ts           the only place the model is called
src/pipeline.ts      orchestration and the guard loop
src/checks.ts        structural guard and the named eval checks
src/eval.ts          eval runner, judge, baseline comparison
evals/cases.json     the test cases
```
