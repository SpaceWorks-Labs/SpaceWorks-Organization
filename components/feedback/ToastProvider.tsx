"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useExitingItems } from "@/components/motion/usePresence";
import { pauseClock, resumeClock, startClock, timeLeft, toastLifetime, TOAST_LIMIT, type ToastClock, type ToastSeverity } from "./toastTiming";

type ToastAction = { label: string; onClick: () => void };

type ToastContextValue = {
  /** `durationMs` defaults to 8 seconds; errors ignore it and stay until dismissed. */
  showToast: (message: string, severity?: ToastSeverity, action?: ToastAction | null, durationMs?: number) => void;
};

type ToastState = { id: number; message: string; severity: ToastSeverity; action: ToastAction | null; lifetime: number | null };

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastSeverity, ReactNode> = {
  // Toasts sit on the inverse surface (Deep Ink in light, #1C1C1C in dark): Citron,
  // Warm Yellow, Sky Blue and the kit's dark-theme danger (danger-on-inverse) all
  // clear 4.5:1 there.
  success: <CheckCircle2 className="text-sw-citron" />,
  error: <XCircle className="text-danger-on-inverse" />,
  warning: <AlertTriangle className="text-sw-yellow" />,
  info: <Info className="text-sw-sky" />,
};

/** One toast: its clock runs while it is neither hovered nor focused. Leaving toasts are inert and keep no clock. */
function ToastItem({ toast, leaving, onDismiss }: { toast: ToastState; leaving: boolean; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const clock = useRef<ToastClock | null>(null);
  const paused = hovered || focused || leaving;
  useEffect(() => {
    const now = Date.now();
    const current = clock.current ?? startClock(toast.lifetime, now);
    if (paused) {
      clock.current = pauseClock(current, now);
      return;
    }
    clock.current = resumeClock(current, now);
    const left = timeLeft(clock.current, now);
    if (left === null) return;
    const timer = setTimeout(() => onDismiss(toast.id), left);
    return () => {
      clearTimeout(timer);
      if (clock.current) clock.current = pauseClock(clock.current, Date.now());
    };
  }, [paused, toast.id, toast.lifetime, onDismiss]);
  return (
    <div
      data-state={leaving ? "closed" : "open"}
      inert={leaving}
      onPointerEnter={(event) => event.pointerType !== "touch" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setFocused(false)}
      className="sw-fx-toast pointer-events-auto flex w-full max-w-[460px] items-center gap-3 rounded-lg bg-inverse py-3 pl-4 pr-2 text-body-ui text-on-inverse shadow-float"
    >
      <span aria-hidden className="inline-flex shrink-0 [&_svg]:size-5">{icons[toast.severity]}</span>
      <p className="min-w-0 flex-1">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-semibold underline-offset-4 hover:underline"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-on-inverse transition-colors after:absolute after:-inset-1 duration-(--sw-dur-fast) ease-sw hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)]"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/**
 * Ink toasts (docs/DESIGN.md §4.15, UX-8.9, kit motion/toast): bottom-centre on phones, bottom-left from 768px, up to
 * three stacked, each with an optional single action such as Undo and a close button.
 * - 8 seconds by default, paused while hovered (mouse or pen) or focused; errors stay until dismissed.
 * - Enter over base (180ms) from 12px below, leave over fast (120ms); still under reduced motion.
 * - Never takes focus. Messages are announced through a polite status region, errors through an alert region.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [announcement, setAnnouncement] = useState<{ text: string; error: boolean }>({ text: "", error: false });
  const counter = useRef(0);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const showToast = useCallback((message: string, severity: ToastSeverity = "info", action: ToastAction | null = null, durationMs?: number) => {
    counter.current += 1;
    const toast: ToastState = { id: counter.current, message, severity, action, lifetime: toastLifetime(severity, durationMs) };
    setToasts((current) => [...current, toast].slice(-TOAST_LIMIT));
    // Clear first, then set in a separate update, so a repeated message is announced again.
    clearTimeout(announceTimer.current);
    setAnnouncement({ text: "", error: false });
    announceTimer.current = setTimeout(() => setAnnouncement({ text: message, error: severity === "error" }), 50);
  }, []);

  useEffect(() => () => clearTimeout(announceTimer.current), []);

  const shown = useExitingItems(toasts, (toast) => toast.id);
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement.error ? "" : announcement.text}
      </div>
      <div className="sr-only" role="alert" aria-atomic="true">
        {announcement.error ? announcement.text : ""}
      </div>
      <section aria-label="Notifications" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 md:items-start md:p-6">
        {shown.map(({ item, leaving }) => (
          <ToastItem key={item.id} toast={item} leaving={leaving} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
