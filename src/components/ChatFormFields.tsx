"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Card } from "@/components/ui/primitives";
import type { UiMessage, FormValues } from "@/utils/ai-schemas";
import { ONBOARDING_STEPS } from "@/lib/flow";

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

  function validate(v: string): string | null {
    if ("required" in message && (message as { required?: boolean }).required && !v.trim())
      return "This field is required.";
    if (v.length > 254) return "That looks too long — please shorten it.";
    if (message.type === "input_request" && message.inputType === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()))
      return "Enter a valid work email, e.g. ada@company.com.";
    return null;
  }

  return (
    <Card className="mt-2 border-primary/30 bg-accent/40">
      <p className="text-sm font-medium">{message.label}</p>
      {message.type === "input_request" ? (
        <div className="mt-2 flex gap-2">
          <Input
            type={message.inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={message.label}
          />
          <Button
            onClick={() => {
              const err = validate(value);
              if (err) return setError(err);
              setError(null);
              onSubmit(message.field, value);
            }}
          >
            Save
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {message.options.map((opt) => (
            <Button key={opt} onClick={() => onSubmit(message.field, opt)}>
              {opt}
            </Button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </Card>
  );
}

export function FormSummary({ values }: { values: FormValues }) {
  const rows = ONBOARDING_STEPS.filter((s) => s.field in values).map((s) => ({
    label: s.short,
    value: values[s.field],
  }));
  return (
    <Card className="mt-2">
      <p className="text-sm font-semibold">Here&apos;s what I captured</p>
      <dl className="mt-2 space-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
