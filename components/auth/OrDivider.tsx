/** The "or" rule between the sign-in buttons and the fields below them (UX P22). */
export function OrDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-caption text-ink-muted">
      <span aria-hidden className="h-px flex-1 bg-line" />
      {label}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
