export interface Check {
  name: string;
  pass: boolean;
}

/**
 * Cheap structural checks used by the pipeline guard. If the builder drifts from the output
 * contract (markdown fences, chatter around the HTML, truncated page) the pipeline rejects it
 * and asks the builder to fix it, before the reviewer ever sees it.
 */
export function structuralProblems(html: string): string[] {
  const problems: string[] = [];
  if (!/^\s*<!doctype html/i.test(html)) problems.push("Output must start with <!doctype html>");
  if (!/<\/html>\s*$/i.test(html.trim())) problems.push("Output must end with </html> with nothing after it");
  if (html.includes("```")) problems.push("Output contains markdown fences; return raw HTML only");
  if (html.length < 1500) problems.push("Page is too short to be a real page");
  if (html.length > 150_000) problems.push("Page is too large; keep it under 150KB");
  return problems;
}

/** Deterministic checks used by the eval harness. Each one is pass/fail and named, so a regression is readable. */
export function runChecks(html: string, keywords: string[] = []): Check[] {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  add("structure", structuralProblems(html).length === 0);
  add("title", /<title>\s*\S[^<]*<\/title>/i.test(html));
  add("viewport", /<meta[^>]+name=["']viewport["']/i.test(html));
  add("responsive", /@media[^{]*\{/i.test(html));
  add("self-contained", !/<script[^>]+src=/i.test(html) && !/\ssrc=["']https?:/i.test(html));
  add("no-placeholders", !/lorem ipsum|your (?:text|content|company) here|\bTODO\b|placeholder text/i.test(html));

  const ids = new Set([...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((m) => m[1]));
  const hrefs = [...html.matchAll(/\shref=["']#([^"']*)["']/gi)].map((m) => m[1]);
  add("anchors-resolve", hrefs.every((h) => h !== "" && ids.has(h)));

  const h1Count = html.match(/<h1[\s>]/gi)?.length ?? 0;
  const sectionCount = html.match(/<section[\s>]/gi)?.length ?? 0;
  add("semantic", /<main[\s>]/i.test(html) && h1Count === 1 && sectionCount >= 3);

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  add("img-alt", imgs.every((i) => /\salt=/i.test(i)));

  if (keywords.length) {
    const text = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    const hits = keywords.filter((k) => new RegExp(k, "i").test(text)).length;
    add("keywords", hits / keywords.length >= 0.75);
  }

  return checks;
}
