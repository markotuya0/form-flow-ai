// Provider adapter — mock by default so demo + tests cost $0.
// Set LLM_PROVIDER=gemini|openai + key to go live.
// The conversation script itself lives in flow.ts (single source of truth)
// and the live system prompt in prompt.ts — this file only picks transport.

export type LlmProvider = "mock" | "gemini" | "openai";

export function getProvider(): LlmProvider {
  const p = process.env.LLM_PROVIDER as LlmProvider | undefined;
  if (p === "gemini" || p === "openai" || p === "mock") return p;
  return "mock";
}
