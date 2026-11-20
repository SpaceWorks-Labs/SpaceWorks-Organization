"use client";

import { forwardRef, useCallback, useEffect, useRef, useState, type RefObject, type ComponentPropsWithoutRef, type ElementRef, type ReactNode, type Ref } from "react";
import Link from "next/link";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSlideIndicator } from "@/components/motion/useSlideIndicator";

/* ---------- Underline tabs (docs/DESIGN.md §4.4): 2px teal (or organisation accent) underline ----------
   One underline slides between tabs (TabIndicator); the triggers' own underlines show only before it is placed. */

export const Tabs = TabsPrimitive.Root;

const tabListClasses = "relative flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const tabClasses =
  "sw-tab relative z-[1] inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[15px] font-semibold text-ink-muted transition-colors duration-(--sw-dur-fast) ease-sw hover:text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent [&_svg]:size-4";

/**
 * Tab rows scroll sideways on narrow screens. These hints show a faded arrow
 * on each side that has hidden tabs, so people know there is more to see;
 * clicking an arrow scrolls the row. Keyboard users keep the tabs' own
 * arrow-key navigation, so the hint buttons are skipped in the tab order.
 */
function useScrollHints<T extends HTMLElement>() {
  const node = useRef<T | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = node.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((current) => (current.left === left && current.right === right ? current : { left, right }));
  }, []);
  useEffect(() => {
    const el = node.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [update]);
  const scroll = (direction: -1 | 1) => {
    const el = node.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.7), behavior: reduce ? "auto" : "smooth" });
  };
  return { node, edges, scroll };
}

/** Underline tabs only: a trigger restyled as a pill (its underline hidden) keeps its own highlight. */
function hasUnderline(target: HTMLElement) {
  return getComputedStyle(target, "::after").display !== "none";
}

/**
 * The one underline that slides to the current tab (kit motion/sidebar): transform only, instant under reduced motion.
 */
function TabIndicator({ list, selector }: { list: RefObject<HTMLElement | null>; selector: string }) {
  const bar = useRef<HTMLSpanElement>(null);
  useSlideIndicator(list, bar, selector, hasUnderline);
  return <span ref={bar} aria-hidden className="sw-indicator sw-tab-indicator" />;
}

function setRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref) (ref as { current: T | null }).current = value;
    }
  };
}

function ScrollHint({ side, visible, onClick }: { side: "left" | "right"; visible: boolean; onClick: () => void }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 z-[1] flex items-center transition-opacity duration-(--sw-dur-base) ease-sw",
        side === "left" ? "left-0 bg-gradient-to-r from-canvas from-55% to-transparent pr-6" : "right-0 justify-end bg-gradient-to-l from-canvas from-55% to-transparent pl-6",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onClick}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md border border-line bg-panel text-ink-secondary transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted hover:text-ink",
          visible && "pointer-events-auto",
        )}
      >
        {side === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
    </span>
  );
}

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(function TabsList(
  { className, children, ...props },
  ref,
) {
  const { node, edges, scroll } = useScrollHints<HTMLDivElement>();
  return (
    <div className="relative min-w-0">
      <ScrollHint side="left" visible={edges.left} onClick={() => scroll(-1)} />
      <TabsPrimitive.List ref={setRefs(ref, node)} className={cn(tabListClasses, className)} {...props}>
        {children}
        <TabIndicator list={node} selector={'[role="tab"][data-state="active"]'} />
      </TabsPrimitive.List>
      <ScrollHint side="right" visible={edges.right} onClick={() => scroll(1)} />
    </div>
  );
});

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { accent?: boolean }
>(function TabsTrigger({ className, accent, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabClasses, "data-[state=active]:text-ink", accent ? "data-[state=active]:after:bg-accent" : "data-[state=active]:after:bg-primary", className)}
      {...props}
    />
  );
});

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(function TabsContent(
  { className, ...props },
  ref,
) {
  return <TabsPrimitive.Content ref={ref} className={cn("pt-6 focus-visible:outline-none", className)} {...props} />;
});

/** Link-based underline tabs for navigation between routes. */
export function NavTabs({ items, label, className }: { items: Array<{ href: string; label: ReactNode; active: boolean }>; label: string; className?: string }) {
  const { node, edges, scroll } = useScrollHints<HTMLElement>();
  return (
    <div className="relative min-w-0">
      <ScrollHint side="left" visible={edges.left} onClick={() => scroll(-1)} />
      <nav ref={node} aria-label={label} className={cn(tabListClasses, className)}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={cn(tabClasses, item.active && "text-ink after:bg-primary")}
          >
            {item.label}
          </Link>
        ))}
        <TabIndicator list={node} selector={'a[aria-current="page"]'} />
      </nav>
      <ScrollHint side="right" visible={edges.right} onClick={() => scroll(1)} />
    </div>
  );
}
