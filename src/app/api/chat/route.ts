import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getProvider } from "@/lib/llm";
import {
  applyAnswer,
  buildHandoff,
  currentStep,
  isComplete,
  ONBOARDING_STEPS,
  tryFreeText,
  type Answer,
  type FormValues,
} from "@/lib/flow";

// POST /api/chat — SSE stream of {token} text chunks and {ui} structured
// form events. Stateless: every turn carries {messages, values} plus an
// optional structured {answer}. The server advances ONLY on the answer or
// free-text in this payload — never on remembered state — so questions
// can't repeat and answers can't arrive a turn late.
export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  let body: { messages?: { role: string; text: string }[]; values?: FormValues; answer?: Answer };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "Body must be JSON with {messages, values}." }, requestId },
      { status: 400 }
    );
  }
  let values: FormValues = body.values ?? {};
  const provider = getProvider();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const handoff = buildHandoff(values);
      const timeout = setTimeout(() => {
        try {
          send({ error: { code: "TIMEOUT", message: "Taking too long — please retry." }, requestId });
          controller.close();
        } catch {
          /* already closed */
        }
      }, handoff.timeoutMs);

      async function* tokens(text: string) {
        for (const word of text.split(" ")) {
          yield word + " ";
          await new Promise((r) => setTimeout(r, 25));
        }
      }

      function askStep() {
        const step = currentStep(values)!;
        return {
          ui:
            step.kind === "select"
              ? { type: "select_request", field: step.field, label: step.label, options: step.options }
              : { type: "input_request", field: step.field, label: step.label, inputType: step.kind, required: step.required },
        };
      }

      try {
        if (provider !== "mock") {
          for await (const t of tokens(
            `AI provider '${provider}' isn't connected yet. The demo runs fully offline — no key needed.`
          ))
            send({ token: t });
          send("[DONE]");
          return;
        }

        // 1. Structured answer (field widget submitted): validate + merge.
        if (body.answer) {
          const applied = applyAnswer(values, body.answer);
          if (!applied.ok) {
            send({ ui: { type: "progress", completed: Object.keys(values).length, total: ONBOARDING_STEPS.length } });
            for await (const t of tokens(applied.error)) send({ token: t });
            const s = applied.step;
            send({
              ui:
                s.kind === "select"
                  ? { type: "select_request", field: s.field, label: s.label, options: s.options }
                  : { type: "input_request", field: s.field, label: s.label, inputType: s.kind, required: s.required },
            });
            send("[DONE]");
            return;
          }
          values = applied.values;
        } else {
          // 2. Free-typed text: accept it if it satisfies the current step.
          const lastUser = body.messages?.filter((m) => m.role === "user").at(-1)?.text;
          if (lastUser) {
            const matched = tryFreeText(values, lastUser);
            if (matched) values = matched;
          }
        }

        send({ ui: { type: "progress", completed: Object.keys(values).length, total: ONBOARDING_STEPS.length } });

        if (isComplete(values)) {
          send({ ui: { type: "tool_call", tool: "verify", args: { email: values.email } } });
          await new Promise((r) => setTimeout(r, 400));
          send({ ui: { type: "tool_result", tool: "verify", result: { valid: true } } });
          for await (const t of tokens("All set! Here's what I captured:")) send({ token: t });
          send({ ui: { type: "form_complete", summary: values } });
        } else {
          const greeted = (body.messages?.length ?? 0) > 1;
          for await (const t of tokens(greeted ? "Nice — next one." : "Let's get you set up.")) send({ token: t });
          send(askStep());
        }
        send("[DONE]");
      } catch (e) {
        send({
          error: { code: "STREAM_FAILED", message: e instanceof Error ? e.message : "Stream failed." },
          requestId,
        });
      } finally {
        clearTimeout(timeout);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
