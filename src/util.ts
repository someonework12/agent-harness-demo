import { readFileSync } from "node:fs";

/** Prompts are read from disk on every call, so editing a prompt file takes effect on the next run. */
export function prompt(name: string): string {
  return readFileSync(new URL(`../prompts/${name}.md`, import.meta.url), "utf8");
}

export function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:html|json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

export function parseJson<T>(s: string): T {
  try {
    return JSON.parse(stripFences(s)) as T;
  } catch {
    throw new Error(`Model did not return valid JSON: ${s.slice(0, 200)}`);
  }
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "page"
  );
}
