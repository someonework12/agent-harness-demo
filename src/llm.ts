import { GoogleGenAI } from "@google/genai";
import { mockResponse } from "./mock.js";

export const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-flash-latest";
const MIN_INTERVAL_MS = Number(process.env.LLM_MIN_INTERVAL_MS ?? 6500);
const MOCK = process.env.MOCK_LLM === "1";

let client: GoogleGenAI | null = null;
let lastCallAt = 0;
let fallbackDisabled = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.");
  }
  return (client ??= new GoogleGenAI({ apiKey }));
}

export interface GenerateOptions {
  /** Which agent is calling. Used for logging and by the offline mock. */
  tag: "planner" | "builder" | "reviewer" | "judge";
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  tokens: number;
  ms: number;
}

/**
 * The single place the model is called. Everything else goes through here, so rate limiting,
 * retries and token accounting live in one spot.
 */
export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  if (MOCK) {
    await sleep(5);
    return { text: mockResponse(opts.tag, opts.user), tokens: 0, ms: 5 };
  }

  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);

  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // After two failures on the main model, alternate in a fallback model (attempts 3 and 5).
    const useFallback = !fallbackDisabled && attempt > 2 && attempt % 2 === 1;
    const model = useFallback ? FALLBACK_MODEL : MODEL;
    const start = Date.now();
    try {
      lastCallAt = Date.now();
      const res = await getClient().models.generateContent({
        model,
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
          temperature: opts.temperature ?? 0.7,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      });
      const text = res.text ?? "";
      if (!text.trim()) throw new Error("Empty response from model");
      if (useFallback) console.warn(`  [llm:${opts.tag}] answered by fallback model ${model}`);
      return { text, tokens: res.usageMetadata?.totalTokenCount ?? 0, ms: Date.now() - start };
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      if (useFallback && /404|NOT_FOUND/i.test(msg)) {
        fallbackDisabled = true; // the fallback name does not exist for this key; stop trying it
        continue;
      }
      const retryable = /429|500|503|UNAVAILABLE|RESOURCE_EXHAUSTED|Empty response|fetch failed/i.test(msg);
      if (!retryable || attempt === maxAttempts) throw err;
      const backoff = 6000 * attempt;
      console.warn(`  [llm:${opts.tag}] ${model} busy, retry ${attempt} in ${backoff / 1000}s (${msg.slice(0, 60)})`);
      await sleep(backoff);
    }
  }
  throw new Error("unreachable");
}
