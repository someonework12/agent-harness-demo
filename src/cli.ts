import { MODEL } from "./llm.js";
import { runPipeline } from "./pipeline.js";

const idea = process.argv.slice(2).join(" ").trim();
if (!idea) {
  console.error('Usage: npm run build-page -- "your one-line idea"');
  process.exit(1);
}

console.log(`Model: ${process.env.MOCK_LLM === "1" ? "mock (offline)" : MODEL}`);
console.log(`Idea:  ${idea}\n`);

const r = await runPipeline(idea, { log: true });

console.log(
  `\nDone in ${(r.totalMs / 1000).toFixed(1)}s, ${r.totalTokens} tokens, ${r.revised ? "1 revision" : "no revision"}`,
);
console.log(`Page:   ${r.dir}/index.html`);
console.log(`Trace:  ${r.dir}/trace.json`);
console.log("Preview: npm run serve, then open the forwarded port 4173");
