"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Check, Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Card } from "@/components/ui/primitives";
import type { UiMessage, FormValues } from "@/utils/ai-schemas";
import { getTemplate } from "@/lib/flow";

// Renders dynamic inputs when the AI emits input_request / select_request.
export function ChatFormFields({
  message,
  onSubmit,
}: {
  message: Extract<UiMessage, { type: "input_request" | "select_request" }>;
  onSubmit: (field: string, value: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  function fail(msg: string) {
    setError(msg);
    setShake((s) => s + 1); // retrigger the shake animation
  }

  function validate(v: string): string | null {
    if ("required" in message && (message as { required?: boolean }).required && !v.trim())
      return "This one's required — give it a go.";
    if (v.length > 2000) return "That's a bit long — please shorten it.";
    if (message.type === "input_request" && message.inputType === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()))
      return "Hmm, that email doesn't look right — try ada@company.com.";
    return null;
  }

  function submit() {
    const err = validate(value);
    if (err) return fail(err);
    setError(null);
    onSubmit(message.field, value.trim());
  }

  const isTextarea = message.type === "input_request" && message.inputType === "textarea";

  return (
    <Card className="mt-2 border-primary/30 bg-accent/40">
      <p className="text-sm font-medium">{message.label}</p>
      {message.type === "input_request" ? (
        <motion.div
          key={shake}
          animate={shake > 0 ? { x: [0, -10, 10, -6, 6, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="mt-2"
        >
          <div className={isTextarea ? "" : "flex gap-2"}>
            {isTextarea ? (
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Describe what happened…"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <Input
                type={message.inputType === "date" ? "date" : message.inputType === "email" ? "email" : "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={message.label}
              />
            )}
            <Button onClick={submit} className={isTextarea ? "mt-2" : ""}>
              Save
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {message.options.map((opt) => (
            <Button key={opt} onClick={() => onSubmit(message.field, opt)}>
              {opt}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </Card>
  );
}

export function FormSummary({
  values,
  templateId,
  onEdit,
}: {
  values: FormValues;
  templateId: string;
  onEdit?: (field: string) => void;
}) {
  const steps = getTemplate(templateId).steps;
  const rows = steps.filter((s) => s.field in values).map((s) => ({
    field: s.field,
    label: s.short,
    value: values[s.field],
  }));
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    const text = rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API blocked (permissions/iframe) — legacy fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="mt-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Here&apos;s what I captured</p>
        <button
          onClick={copyAll}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <dl className="mt-2 space-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.field} className="group flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              <span className="max-w-48 truncate">{r.value}</span>
              {onEdit && (
                <button
                  onClick={() => onEdit(r.field)}
                  title={`Edit ${r.label}`}
                  aria-label={`Edit ${r.label}`}
                  className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
