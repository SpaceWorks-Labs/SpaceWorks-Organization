"use client";

import { forwardRef, useCallback, useRef, useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { BoxSpinner } from "@/components/brand/BoxSpinner";
import { controlClasses } from "./styles";

export type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
  /** A query is in flight: the magnifier cross-fades to the box spinner and back. */
  loading?: boolean;
  loadingLabel?: string;
  /** Shortcut hint (for example "Ctrl K"); fades out while the field has focus or text. */
  shortcut?: string;
  /** Escape clears a non-empty field (default). Turn off where Escape closes a popup. */
  clearOnEscape?: boolean;
  clearLabel?: string;
  /** Classes for the input; `className` goes on the wrapper (width, margins). */
  inputClassName?: string;
};

/** Inline style for the n-th suggestion row (`.sw-search-item`): the first six rise 20ms apart. */
export function searchItemStyle(index: number): CSSProperties {
  return { "--sw-i": Math.min(index, 5) } as CSSProperties;
}

/**
 * The one search input (kit motion/search): magnifier that turns accent and nudges on focus, a loading swap to the
 * box spinner, a clear button, Escape to clear and an optional shortcut hint. Colour changes only on hover; the
 * movement is transform and opacity and stops under reduced motion. Controlled or uncontrolled; clearing fires the
 * caller's own onChange.
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { loading = false, loadingLabel = "Searching…", shortcut, clearOnEscape = true, clearLabel = "Clear search", className, inputClassName, value, defaultValue, onChange, onKeyDown, disabled, readOnly, ...rest },
  forwarded,
) {
  const inner = useRef<HTMLInputElement | null>(null);
  const [local, setLocal] = useState(String(defaultValue ?? ""));
  const text = value !== undefined ? String(value) : local;
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      inner.current = node;
      if (typeof forwarded === "function") forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [forwarded],
  );

  const clear = () => {
    const input = inner.current;
    if (!input) return;
    // The native setter plus an input event, so React fires the caller's onChange (controlled or not).
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Escape" || !clearOnEscape || !text || disabled || readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    clear();
  };
  const canClear = text.length > 0 && !disabled && !readOnly;

  return (
    <span className={cn("sw-search", className)} data-loading={loading ? "" : undefined}>
      <span className="sw-search-icon" data-loading={loading ? "" : undefined}>
        <Search aria-hidden="true" size={18} className="sw-search-glyph" />
        {loading ? (
          <span className="sw-search-spin">
            <BoxSpinner label={loadingLabel} size={16} mono />
          </span>
        ) : null}
      </span>
      <input
        {...rest}
        ref={setRef}
        type="search"
        className={cn(controlClasses, "sw-search-input", inputClassName)}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => {
          setLocal(event.target.value);
          onChange?.(event);
        }}
        onKeyDown={keyDown}
      />
      {canClear ? (
        <button type="button" aria-label={clearLabel} className="sw-search-clear" onMouseDown={(event) => event.preventDefault()} onClick={clear}>
          <X aria-hidden="true" size={16} />
        </button>
      ) : null}
      {shortcut ? (
        <kbd className="sw-search-kbd code-text text-xs text-ink-muted" data-text={text ? "" : undefined} aria-hidden="true">
          {shortcut}
        </kbd>
      ) : null}
    </span>
  );
});
