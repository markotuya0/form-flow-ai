// Conversation engine — templates, state machine, server-side validation
// (evaluator gate), and agent handoff contract.
// Pattern: sequential core (ask → validate → verify → summarize) with a
// router branch on field kind (text / email / date / textarea / select).

export type FieldKind = "text" | "email" | "date" | "textarea" | "select";

export interface StepDef {
  field: string;
  label: string;
  short: string; // stepper + summary label, never a raw key
  kind: FieldKind;
  required: boolean;
  maxLength: number;
  options?: readonly string[];
}

export interface TemplateDef {
  id: string;
  name: string; // shown in the template picker
  greeting: string;
  steps: readonly StepDef[];
  verifyField?: string; // if set, the verify step runs on this field first
  completeText: string;
}

export const TEMPLATES: Record<string, TemplateDef> = {
  onboarding: {
    id: "onboarding",
    name: "Employee onboarding",
    greeting: "Welcome! I'll get you onboarded in about a minute. Just say hello to begin.",
    steps: [
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
    ],
    verifyField: "email",
    completeText: "All set! Here's what I captured:",
  },
  bug: {
    id: "bug",
    name: "Bug report",
    greeting: "Sorry something broke! Answer 4 quick questions and I'll file the report.",
    steps: [
      { field: "title", label: "Give the bug a short title.", short: "Title", kind: "text", required: true, maxLength: 120 },
      { field: "email", label: "Where can we reach you about it?", short: "Email", kind: "email", required: true, maxLength: 254 },
      {
        field: "severity",
        label: "How bad is it?",
        short: "Severity",
        kind: "select",
        required: true,
        maxLength: 20,
        options: ["Low", "Medium", "High", "Critical"],
      },
      { field: "details", label: "What happened, step by step?", short: "Details", kind: "textarea", required: true, maxLength: 2000 },
    ],
    completeText: "Thanks! Here's the report I'll file:",
  },
  support: {
    id: "support",
    name: "Support ticket",
    greeting: "Happy to help! Four quick questions and your ticket is in the queue.",
    steps: [
      { field: "fullName", label: "What is your full name?", short: "Name", kind: "text", required: true, maxLength: 100 },
      { field: "email", label: "What email should we reply to?", short: "Email", kind: "email", required: true, maxLength: 254 },
      {
        field: "topic",
        label: "What's it about?",
        short: "Topic",
        kind: "select",
        required: true,
        maxLength: 20,
        options: ["Billing", "Technical", "Account", "Other"],
      },
      { field: "message", label: "Tell us what's going on.", short: "Message", kind: "textarea", required: true, maxLength: 2000 },
    ],
    verifyField: "email",
    completeText: "Ticket received! Here's a copy for your records:",
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

export function getTemplate(id?: string): TemplateDef {
  return TEMPLATES[id ?? ""] ?? TEMPLATES.onboarding;
}

export type FormValues = Record<string, string>;

// Handoff contract between route handler steps. Mirrors the minimum
// contract for multi-step agent workflows: every transition carries the
// workflow id, current step, task, constraints, upstream artifacts,
// token budget guard, and timeout.
export interface Handoff {
  workflowId: string;
  stepId: string; // field name or "verify" | "complete"
  task: string;
  constraints: string[];
  upstreamArtifacts: FormValues;
  maxResponseTokens: number;
  timeoutMs: number;
}

export function currentStep(values: FormValues, steps: readonly StepDef[]): StepDef | null {
  return steps.find((s) => !(s.field in values)) ?? null;
}

export function isComplete(values: FormValues, steps: readonly StepDef[]): boolean {
  return currentStep(values, steps) === null;
}

// Server-side validation. The client also validates, but the server never
// trusts it — invalid values are rejected and the flow stays on the same
// step (evaluator gate).
export function validateValue(step: StepDef, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (step.required && value === "") return { ok: false, error: `${step.short} is required.` };
  if (value.length > step.maxLength)
    return { ok: false, error: `Keep it under ${step.maxLength} characters.` };
  if (step.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
    return { ok: false, error: "Enter a valid email, e.g. ada@company.com." };
  if (step.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return { ok: false, error: "Use YYYY-MM-DD, e.g. 2026-11-01." };
  if (step.kind === "select" && step.options && !step.options.includes(value))
    return { ok: false, error: `Pick one of: ${step.options.join(", ")}.` };
  return { ok: true, value };
}

export function buildHandoff(templateId: string, values: FormValues): Handoff {
  const template = getTemplate(templateId);
  const step = currentStep(values, template.steps);
  return {
    workflowId: template.id,
    stepId: step ? step.field : isComplete(values, template.steps) ? "complete" : "verify",
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
  steps: readonly StepDef[],
  values: FormValues,
  answer: Answer
): { ok: true; values: FormValues } | { ok: false; error: string; step: StepDef } {
  const step = steps.find((s) => s.field === answer.field);
  const fallback = currentStep(values, steps);
  if (!step || !fallback) return { ok: false, error: "Let's pick up where we left off.", step: steps[0] };
  const check = validateValue(step, answer.value);
  if (!check.ok) return { ok: false, error: check.error, step };
  return { ok: true, values: { ...values, [step.field]: check.value } };
}

// Free-typed text (user typed instead of tapping): if it satisfies the
// current step, accept it; otherwise return null and the flow re-asks.
// Greetings on an empty form ("hi", "hello") are never answers.
const GREETING_RE = /^(hi+|hello+|hey+|yo|start|begin|let'?s go|good (morning|afternoon|evening))\b[!. ]*$/i;

export function isGreeting(text: string): boolean {
  return GREETING_RE.test(text.trim());
}
export function tryFreeText(
  steps: readonly StepDef[],
  values: FormValues,
  text: string
): FormValues | null {
  const step = currentStep(values, steps);
  if (!step || step.kind === "select") return null;
  const check = validateValue(step, text);
  if (!check.ok) return null;
  return { ...values, [step.field]: check.value };
}

// Editing an answer rewinds the flow: the edited field and everything
// after it are cleared, so the engine re-asks from that point.
export function rewindToField(
  steps: readonly StepDef[],
  values: FormValues,
  field: string
): FormValues {
  const idx = steps.findIndex((s) => s.field === field);
  if (idx === -1) return values;
  const keep = new Set(steps.slice(0, idx).map((s) => s.field));
  return Object.fromEntries(Object.entries(values).filter(([k]) => keep.has(k)));
}
