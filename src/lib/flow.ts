// Conversation state machine — single source of truth for step order,
// server-side validation (evaluator gate), and agent handoff contract.
// Pattern: sequential core (ask → validate → verify → summarize) with a
// router branch on field kind (text / email / date / select).

export type FieldKind = "text" | "email" | "date" | "select";

export interface StepDef {
  field: string;
  label: string;
  short: string; // stepper + summary label, never a raw key
  kind: FieldKind;
  required: boolean;
  maxLength: number;
  options?: readonly string[];
}

export const ONBOARDING_STEPS: readonly StepDef[] = [
  { field: "fullName", label: "What is your full name?", short: "Name", kind: "text", required: true, maxLength: 100 },
  { field: "email", label: "What is your work email?", short: "Email", kind: "email", required: true, maxLength: 254 },
  {
    field: "role",
    label: "Which role are you joining as?",
    short: "Role",
    kind: "select",
    required: true,
    maxLength: 50,
    options: ["Frontend", "Backend", "Full Stack", "DevOps"],
  },
  { field: "startDate", label: "When is your start date?", short: "Start date", kind: "date", required: true, maxLength: 10 },
];

export type FormValues = Record<string, string>;

// Handoff contract between route handler steps. Mirrors the minimum
// contract for multi-step agent workflows: every transition carries the
// workflow id, current step, task, constraints, upstream artifacts,
// token budget guard, and timeout.
export interface Handoff {
  workflowId: "onboarding-v1";
  stepId: string; // field name or "verify" | "complete"
  task: string;
  constraints: string[];
  upstreamArtifacts: FormValues;
  maxResponseTokens: number;
  timeoutMs: number;
}

export function currentStep(values: FormValues): StepDef | null {
  return ONBOARDING_STEPS.find((s) => !(s.field in values)) ?? null;
}

export function isComplete(values: FormValues): boolean {
  return currentStep(values) === null;
}

// Server-side validation. The client also validates, but the server never
// trusts it — invalid values are rejected and the flow stays on the same
// step (evaluator gate, max 3 attempts before offering restart).
export function validateValue(step: StepDef, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (step.required && value === "") return { ok: false, error: `${step.field} is required.` };
  if (value.length > step.maxLength)
    return { ok: false, error: `${step.field} must be under ${step.maxLength} characters.` };
  if (step.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
    return { ok: false, error: "Enter a valid work email, e.g. ada@company.com." };
  if (step.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return { ok: false, error: "Use YYYY-MM-DD, e.g. 2026-11-01." };
  if (step.kind === "select" && step.options && !step.options.includes(value))
    return { ok: false, error: `Pick one of: ${step.options.join(", ")}.` };
  return { ok: true, value };
}

export function buildHandoff(values: FormValues): Handoff {
  const step = currentStep(values);
  return {
    workflowId: "onboarding-v1",
    stepId: step ? step.field : isComplete(values) ? "complete" : "verify",
    task: step ? `Collect ${step.field}` : "Verify details and summarize",
    constraints: ["one question at a time", "strict JSON UI events only", "never invent values"],
    upstreamArtifacts: { ...values },
    maxResponseTokens: 300,
    timeoutMs: 15000,
  };
}

// Structured answer from the client. The chat bubble shows friendly text,
// but the protocol always carries the exact field + raw value — this kills
// the stale-state double-ask: the server advances on THIS payload, never on
// whatever it remembers from last turn.
export interface Answer {
  field: string;
  value: string;
}

export function applyAnswer(
  values: FormValues,
  answer: Answer
): { ok: true; values: FormValues } | { ok: false; error: string; step: StepDef } {
  const step = ONBOARDING_STEPS.find((s) => s.field === answer.field);
  if (!step) return { ok: false, error: "Let's pick up where we left off.", step: currentStep(values)! };
  const check = validateValue(step, answer.value);
  if (!check.ok) return { ok: false, error: check.error, step };
  return { ok: true, values: { ...values, [step.field]: check.value } };
}

// Free-typed text (user typed instead of tapping): if it satisfies the
// current step, accept it; otherwise return null and the flow re-asks.
export function tryFreeText(values: FormValues, text: string): FormValues | null {
  const step = currentStep(values);
  if (!step || step.kind === "select") return null;
  const check = validateValue(step, text);
  if (!check.ok) return null;
  return { ...values, [step.field]: check.value };
}
