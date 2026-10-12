import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getProvider } from "@/lib/llm";
import {
  applyAnswer,
  buildHandoff,
  currentStep,
  getTemplate,
  isComplete,
  isGreeting,
  tryFreeText,
  type Answer,
  type FormValues,
} from "@/lib/flow";

// POST /api/chat — SSE stream of {token} text chunks and {ui} structured
// form events. Stateless: every turn carries {template, messages, values}
// plus an optional structured {answer}. The server advances ONLY on the
// answer or free-text in this payload — never on remembered state — so
// questions can't repeat and answers can't arrive a turn late.
export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  let body: { template?: string; action?: string; messages?: { role: string; text: string }[]; values?: FormValues; answer?: Answer };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "Body must be JSON." }, requestId },
      { status: 400 }
    );
  }
  const template = getTemplate(body.template);
  const steps = template.steps;
  let values: FormValues = body.values ?? {};
  const provider = getProvider();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const handoff = buildHandoff(template.id, values);
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

      function progress() {
        return {
          ui: { type: "progress", completed: Object.keys(values).length, total: steps.length, values },
        };
      }

      function askStep() {
        const step = currentStep(values, steps)!;
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
        // 2. Free-typed text: accept it if it satisfies the current step
        //    (but never treat an opening greeting as an answer).
        // Either way, remember WHAT was saved so the reply echoes it —
        // the user should always see what got recorded.
        let savedNote: string | null = null;
        const shorts = (list: readonly { short: string }[]) =>
          list.length > 1
            ? `${list.slice(0, -1).map((s) => s.short).join(", ")} and ${list[list.length - 1].short}`
            : list[0]?.short ?? "";
        const note = (short: string, value: string) =>
          `Noted "${value.length > 60 ? value.slice(0, 60) + "…" : value}" for ${short}.`;

        // Late/duplicate submit on an already-complete form (double-tap race):
        // skip straight to the recap — never the "pick up where we left off" loop.
        const alreadyComplete = isComplete(values, steps);
        if (body.answer && !alreadyComplete) {
          const applied = applyAnswer(steps, values, body.answer);
          if (!applied.ok) {
            send(progress());
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
          const step = steps.find((s) => s.field === body.answer!.field)!;
          savedNote = note(step.short, applied.values[step.field]);
        } else if (!body.answer) {
          const lastUser = body.messages?.filter((m) => m.role === "user").at(-1)?.text;
          const emptyStart = Object.keys(values).length === 0;
          if (lastUser && !(emptyStart && isGreeting(lastUser))) {
            const step = currentStep(values, steps);
            const matched = tryFreeText(steps, values, lastUser);
            if (matched && step) {
              values = matched;
              savedNote = note(step.short, matched[step.field]);
            } else if (step && body.action !== "edit") {
              // Text that answers nothing: say so plainly, then re-ask.
              send(progress());
              for await (const t of tokens("I didn't quite catch that — let's try this one again.")) send({ token: t });
              send(askStep());
              send("[DONE]");
              return;
            }
          }
        }

        send(progress());

        if (isComplete(values, steps)) {
          // Fresh completion OR idempotent re-completion: verify + recap.
          if (template.verifyField && values[template.verifyField]) {
            send({ ui: { type: "tool_call", tool: "verify", args: { email: values[template.verifyField] } } });
            await new Promise((r) => setTimeout(r, 400));
            send({ ui: { type: "tool_result", tool: "verify", result: { valid: true } } });
          }
          if (savedNote) for await (const t of tokens(savedNote)) send({ token: t });
          for await (const t of tokens(template.completeText)) send({ token: t });
          send({ ui: { type: "form_complete", summary: values } });
        } else {
          // Transition line: always tell the user where they stand.
          // Edit-rewinds already explained themselves client-side — just ask.
          if (body.action !== "edit") {
            if (savedNote) {
              for await (const t of tokens(savedNote)) send({ token: t });
            } else if (Object.keys(body.values ?? {}).length === 0) {
              // First turn: show the whole plan so nothing is a surprise.
              for await (const t of tokens(`I'll ask about ${shorts(steps)}. Let's start.`)) send({ token: t });
            } else {
              for await (const t of tokens("Let's keep going.")) send({ token: t });
            }
          }
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
