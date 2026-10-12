import { z } from "zod";

// Structured UI instructions the LLM may emit inside the SSE stream.
// Per prompt-engineer-toolkit skill: enforce strict JSON, never free-form HTML.

export const InputRequestSchema = z.object({
  type: z.literal("input_request"),
  field: z.string(),
  label: z.string(),
  inputType: z.enum(["text", "email", "number", "date", "textarea"]).default("text"),
  required: z.boolean().default(true),
});

export const SelectRequestSchema = z.object({
  type: z.literal("select_request"),
  field: z.string(),
  label: z.string(),
  options: z.array(z.string()).min(2),
});

export const ProgressSchema = z.object({
  type: z.literal("progress"),
  completed: z.number(),
  total: z.number(),
  // Authoritative answers as merged by the server this turn.
  // The client must adopt these verbatim — the server is the
  // single source of truth, which makes drift (and stuck loops) impossible.
  values: z.record(z.string(), z.string()).optional(),
});

export const ToolCallSchema = z.object({
  type: z.literal("tool_call"),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export const ToolResultSchema = z.object({
  type: z.literal("tool_result"),
  tool: z.string(),
  result: z.unknown(),
});

export const FormCompleteSchema = z.object({
  type: z.literal("form_complete"),
  summary: z.record(z.string(), z.string()),
});

export const UiMessageSchema = z.discriminatedUnion("type", [
  InputRequestSchema,
  SelectRequestSchema,
  ProgressSchema,
  ToolCallSchema,
  ToolResultSchema,
  FormCompleteSchema,
]);

export type UiMessage = z.infer<typeof UiMessageSchema>;
export type FormValues = Record<string, string>;
