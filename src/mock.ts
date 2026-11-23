/**
 * Offline stand-in for the model, used by `npm run smoke` and `npm run smoke:eval`.
 * It lets you check the harness wiring (guard, revision loop, eval scoring) without an API key.
 */
export function mockResponse(tag: string, user: string): string {
  if (tag === "planner") {
    const idea = user.replace(/^Idea:\s*/i, "").trim();
    return JSON.stringify({
      title: `Mock: ${idea.slice(0, 40)}`,
      tagline: "Generated offline for smoke testing",
      audience: "Test users",
      sections: [
        { id: "hero", heading: "Welcome", purpose: "Hook" },
        { id: "how", heading: "How it works", purpose: "Explain" },
        { id: "details", heading: "Details", purpose: "Proof" },
        { id: "contact", heading: "Get in touch", purpose: "Call to action" },
      ],
      style: { palette: ["#0f172a", "#f8fafc", "#f59e0b", "#334155"], mood: "calm", typography: "system" },
      must_include: idea.split(/\s+/).slice(0, 8),
    });
  }

  if (tag === "builder") {
    const specText = user.slice(user.indexOf("\n") + 1).split("\n\nPREVIOUS HTML:")[0];
    const spec = JSON.parse(specText) as {
      title: string;
      sections: { id: string; heading: string }[];
      must_include: string[];
    };
    const version = user.includes("FEEDBACK TO FIX") ? "v2" : "v1";
    const nav = spec.sections.map((s) => `<a href="#${s.id}">${s.heading}</a>`).join("");
    const body = spec.sections
      .map(
        (s, i) =>
          `<section id="${s.id}"><h2>${s.heading}</h2><p>${i === 0 ? spec.must_include.join(" ") : "Mock content for " + s.heading}</p></section>`,
      )
      .join("\n");
    const pad = Array.from({ length: 30 }, (_, i) => `.pad-${i}{margin:${i}px}`).join("\n");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${spec.title}</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;color:#0f172a}
nav a{margin-right:1rem}
section{padding:3rem 1.5rem}
@media (max-width:600px){section{padding:2rem 1rem}}

${pad}
</style>
</head>
<body>
<!-- ${version} -->
<header><nav>${nav}</nav></header>
<main>
<h1>${spec.title}</h1>
${body}
</main>
</body>
</html>`;
  }

  if (tag === "reviewer") {
    const revise = user.includes("<!-- v1 -->");
    return JSON.stringify(
      revise
        ? { verdict: "revise", score: 6, issues: ["Hero has no clear call to action button"] }
        : { verdict: "pass", score: 8, issues: [] },
    );
  }

  // judge
  return JSON.stringify({ faithfulness: 4, design: 4, copy: 4, notes: "mock judge" });
}
