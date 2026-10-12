"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Card, Progress } from "@/components/ui/primitives";
import { ChatFormFields, FormSummary } from "@/components/ChatFormFields";
import { ToolTrace } from "@/components/ToolTrace";
import { ONBOARDING_STEPS } from "@/lib/flow";
import type { UiMessage, FormValues } from "@/utils/ai-schemas";

type ChatMsg = { role: "user" | "assistant"; text: string; ui?: UiMessage };

const GREETING: ChatMsg = {
  role: "assistant",
  text: "Welcome! I'll get you onboarded in about a minute. Just say hello to begin.",
};

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-1" aria-label="typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [values, setValues] = useState<FormValues>({});
  const [progress, setProgress] = useState(0);
  const [tool, setTool] = useState<{ tool: string; args: Record<string, unknown>; result?: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const scrollDown = () => boxRef.current?.scrollTo({ top: 99999, behavior: "smooth" });

  async function send(text: string, opts?: { values?: FormValues; answer?: { field: string; value: string } }) {
    setError(null);
    setBusy(true);
    const outgoingValues = opts?.values ?? values;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    scrollDown();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, { role: "user", text }], values: outgoingValues, answer: opts?.answer }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status}). Please try again.`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const pushAssistant = (text: string, ui?: UiMessage) =>
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !ui && text) {
            return [...prev.slice(0, -1), { ...last, text: last.text + text }];
          }
          return [...prev, { role: "assistant", text, ui }];
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim().replace(/^data:\s*/, "");
          if (!line || line === "[DONE]") continue;
          try {
            const evt = JSON.parse(line);
            if (evt.token) pushAssistant(evt.token);
            else if (evt.ui) {
              const ui = evt.ui as UiMessage;
              if (ui.type === "progress") {
                setProgress((ui.completed / ui.total) * 100);
                if (ui.completed === ui.total && ui.total > 0) {
                  // keep local answers in sync with the server's count
                }
              } else if (ui.type === "tool_call") setTool({ tool: ui.tool, args: ui.args as Record<string, unknown> });
              else if (ui.type === "tool_result") setTool((t) => (t ? { ...t, result: ui.result } : t));
              else if (ui.type === "form_complete") {
                pushAssistant("", ui);
                setDoneOpen(true);
              } else pushAssistant("", ui);
            } else if (evt.error) {
              throw new Error(evt.error.message ?? "Something went wrong.");
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Something went wrong." && !/JSON/.test(e.message)) throw e;
          }
        }
      }
      // Sync local answers: server is source of truth for count; merge any
      // structured answer we just sent so the next turn carries it.
      if (opts?.answer) setValues((prev) => ({ ...prev, [opts.answer!.field]: opts.answer!.value }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something didn't go through.");
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  function answerField(field: string, value: string) {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    send(value, { values: nextValues, answer: { field, value } });
  }

  function startOver() {
    setMessages([GREETING]);
    setValues({});
    setProgress(0);
    setTool(null);
    setError(null);
    setDoneOpen(false);
  }

  const doneCount = Math.round((progress / 100) * ONBOARDING_STEPS.length);

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Stepper */}
      <ol className="mb-4 flex items-center gap-1">
        {ONBOARDING_STEPS.map((s, i) => {
          const state = i < doneCount ? "done" : i === doneCount ? "current" : "todo";
          return (
            <li key={s.field} className="flex flex-1 items-center gap-1 last:flex-none">
              <div
                className={
                  state === "done"
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    : state === "current"
                      ? "flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary text-xs font-bold text-primary"
                      : "flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs text-muted-foreground"
                }
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`hidden text-xs sm:inline ${state === "todo" ? "text-muted-foreground" : "font-medium"}`}>
                {s.short}
              </span>
              {i < ONBOARDING_STEPS.length - 1 && <div className="mx-1 h-px flex-1 bg-border" />}
            </li>
          );
        })}
      </ol>
      <div className="mb-3">
        <Progress value={progress} />
      </div>

      <div ref={boxRef} className="h-[480px] space-y-3 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-sm">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className={m.role === "user" ? "text-right" : "text-left"}
            >
              {m.text && (
                <div
                  className={
                    m.role === "user"
                      ? "inline-block rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground shadow-sm"
                      : "inline-block max-w-full rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2 text-sm shadow-sm"
                  }
                >
                  {m.text}
                </div>
              )}
              {m.ui && (m.ui.type === "input_request" || m.ui.type === "select_request") && (
                <ChatFormFields message={m.ui} onSubmit={answerField} />
              )}
              {m.ui?.type === "form_complete" && <FormSummary values={values} />}
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <div className="text-left">
            <div className="inline-block rounded-2xl rounded-bl-md bg-secondary px-3 py-1.5">
              <TypingDots />
            </div>
          </div>
        )}
        {tool && <ToolTrace tool={tool.tool} args={tool.args} result={tool.result} />}
        {error && (
          <Card className="border-red-300 bg-red-50 text-sm text-red-800">
            <p className="font-semibold">Something didn&apos;t go through</p>
            <p className="mt-1 text-xs">Check your connection and try again.</p>
            <details className="mt-1">
              <summary className="cursor-pointer text-xs underline">Details</summary>
              <pre className="mt-1 whitespace-pre-wrap text-xs">{error}</pre>
            </details>
            <Button className="mt-2" onClick={() => send("retry")}>Try again</Button>
          </Card>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && input.trim() && !busy && send(input.trim())}
          placeholder="Type a message…"
          disabled={busy}
        />
        <Button disabled={busy || !input.trim()} onClick={() => send(input.trim())}>
          {busy ? "…" : "Send"}
        </Button>
      </div>

      {/* Completion modal */}
      <AnimatePresence>
        {doneOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDoneOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="mt-3 text-center text-xl font-bold">You&apos;re all set!</h2>
              <p className="mt-1 text-center text-sm text-muted-foreground">
                Onboarding complete — here&apos;s a recap.
              </p>
              <div className="mt-4">
                <FormSummary values={values} />
              </div>
              <div className="mt-5 flex gap-2">
                <Button className="flex-1" onClick={() => setDoneOpen(false)}>Done</Button>
                <Button onClick={startOver}>
                  <RotateCcw className="mr-1 h-4 w-4" /> Start over
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
