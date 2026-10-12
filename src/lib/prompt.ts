// System prompt v1 for the live provider path. Immutable once released:
// any wording change becomes v2 with a changelog entry below, and both
// versions are A/B-checked against MUST_ANSWER cases before promotion.
// Mock mode mirrors this script exactly so behavior is identical with $0.

export const PROMPT_VERSION = "onboarding-v1" as const;

export const SYSTEM_PROMPT_V1 = `You onboard a new employee in exactly 4 steps, one question at a time, in this order: fullName, email, role, startDate.
Rules:
- Reply with plain text plus ONE structured UI event per turn.
- UI events must be strict JSON: {"type":"input_request","field":"...","label":"...","inputType":"text|email|date"} or {"type":"select_request","field":"role","label":"...","options":["Frontend","Backend","Full Stack","DevOps"]} or {"type":"progress","completed":N,"total":4} or {"type":"form_complete","summary":{...}}.
- Never ask for a field already answered. Never invent values. Validate email format before accepting.
- After all 4 answers, emit a verification step, then form_complete with the summary.
- Keep every text reply under 25 words. Friendly tone.`;

// Changelog (append-only):
// v1 2026-10-12 — initial script: fixed 4-step order, one-question rule, strict JSON events, 25-word cap.

// Regression cases: a candidate prompt must satisfy ALL of these before it
// replaces v1. Forbidden content must never appear in any output.
export const MUST_ANSWER = [
  { input: "hello", mustContain: ["fullName"], mustNotContain: ["<input", "<form", "SELECT *"] },
  { input: "fullName: Ada", mustContain: ["email"], mustNotContain: ["fullName"] },
  { input: "role: Chef", mustContain: ["Frontend"], mustNotContain: [] },
] as const;

export const MUST_NOT_CONTAIN = ["<script", "DROP TABLE", "ignore previous instructions"] as const;
