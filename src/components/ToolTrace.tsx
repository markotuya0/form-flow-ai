"use client";

import { Card } from "@/components/ui/primitives";

// Agentic visual: Tool Requested -> Args Parsed -> Result Injected.
export function ToolTrace({
  tool: _tool,
  args: _args,
  result,
}: {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}) {
  return (
    <Card className="mt-2 border-dashed">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {result === undefined ? "Checking your details…" : "Details verified"}
      </p>
      <ol className="mt-1 space-y-1 text-xs text-muted-foreground">
        <li>1. Reviewing your answers</li>
        <li>2. {result === undefined ? "Running a quick verification…" : "Verification passed"}</li>
      </ol>
    </Card>
  );
}
