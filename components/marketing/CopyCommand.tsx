"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

/** Copy a command, saying so in words as well as the icon. Role tokens only, so it works on the page and on the island. */
export function CopyCommand({ command, label = "Copy command", className }: { command: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border border-line-strong px-3.5 text-caption font-semibold text-ink transition-colors duration-(--sw-dur-fast) hover:bg-muted",
        className,
      )}
    >
      {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
