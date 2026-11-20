"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Code-block language names are product names, written as their makers write them.
const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  "sh=Shell|bash=Bash|shell=Shell|console=Console|powershell=PowerShell|ps1=PowerShell|pwsh=PowerShell|cmd=Command Prompt|js=JavaScript|javascript=JavaScript|mjs=JavaScript|ts=TypeScript|typescript=TypeScript|tsx=TSX|json=JSON|yaml=YAML|yml=YAML|toml=TOML|sql=SQL|http=HTTP|ini=INI|env=.env|dotenv=.env|dockerfile=Dockerfile|caddyfile=Caddyfile|html=HTML|css=CSS|xml=XML|text=Text|txt=Text|prisma=Prisma|diff=Diff"
    .split("|")
    .map((pair) => pair.split("=") as [string, string]),
);

export function languageLabel(language: string) {
  return LANGUAGE_LABELS[language.toLowerCase()] ?? (language || "Code");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? "Copied" : "Copy code"}
      className="text-label inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 font-semibold text-ink-muted transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/** A fenced code block: the language, a copy button, and the code in a focusable, scrollable box (Outfit tabular figures, CR-TYPE-01). */
export function DocsCode({ language, code }: { language: string; code: string }) {
  return (
    <figure className="my-6 overflow-hidden rounded-[12px] border border-line bg-muted">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line bg-panel py-0.5 pl-4 pr-1">
        <span className="text-caption font-semibold text-ink-muted">{languageLabel(language)}</span>
        <CopyButton text={code} />
      </figcaption>
      <pre tabIndex={0} className="code-text overflow-x-auto whitespace-pre p-4 text-[0.875rem] leading-relaxed text-ink focus-visible:outline-2 focus-visible:-outline-offset-2">
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
    </figure>
  );
}
