"use client";

import { useState } from "react";

type CopyState = "idle" | "copied" | "failed";

// Copies a family link so Justin can paste it into a text from his phone.
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<CopyState>("idle");

  return (
    <button
      type="button"
      className="dash-copy"
      data-state={state}
      aria-label={`Copy the ${label} link`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
        window.setTimeout(() => setState("idle"), 1800);
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select it instead" : "Copy link"}
    </button>
  );
}
