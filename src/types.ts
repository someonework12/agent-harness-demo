export interface Spec {
  title: string;
  tagline: string;
  audience: string;
  sections: { id: string; heading: string; purpose: string }[];
  style: { palette: string[]; mood: string; typography: string };
  must_include: string[];
}

export interface Review {
  verdict: "pass" | "revise";
  score: number;
  issues: string[];
}

export interface Step {
  agent: string;
  attempt: number;
  ms: number;
  tokens: number;
  note?: string;
}

export interface Timed<T> {
  value: T;
  ms: number;
  tokens: number;
}

export interface BuildFeedback {
  previousHtml: string;
  issues: string[];
}

export interface PipelineResult {
  idea: string;
  slug: string;
  dir: string;
  spec: Spec;
  review: Review;
  html: string;
  steps: Step[];
  revised: boolean;
  totalMs: number;
  totalTokens: number;
}
