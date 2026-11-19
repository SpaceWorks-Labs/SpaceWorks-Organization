"use client";

import { useLayoutEffect, type RefObject } from "react";

const always = () => true;

function setStyles(element: HTMLElement, styles: Record<string, string>) {
  for (const [name, value] of Object.entries(styles)) element.style.setProperty(name, value);
}

/**
 * One box that moves (kit motion/sidebar): positions `indicator` (absolutely placed inside `container`, which must be
 * `position: relative`) over the element matching `selector`. Only `transform` transitions (size is set directly),
 * so it is instant under reduced motion, where the duration tokens are zero. Resizes and the first placement skip
 * the transition. The container gets `data-slide` once placed, so CSS can drop the item's own highlight; it hides
 * when nothing matches or `eligible` refuses the match (for example tabs styled as pills). A MutationObserver on
 * `data-state` and `aria-current` follows the current item, so callers need not pass the active value.
 */
export function useSlideIndicator(
  container: RefObject<HTMLElement | null>,
  indicator: RefObject<HTMLElement | null>,
  selector: string,
  eligible: (target: HTMLElement) => boolean = always,
) {
  useLayoutEffect(() => {
    const host = container.current;
    const bar = indicator.current;
    if (!host || !bar) return;
    let placed = false;
    const place = (animate: boolean) => {
      const target = host.querySelector<HTMLElement>(selector);
      if (!target || !target.offsetWidth || !eligible(target)) {
        setStyles(bar, { opacity: "0" });
        host.removeAttribute("data-slide");
        placed = false;
        return;
      }
      const box = target.getBoundingClientRect();
      const frame = host.getBoundingClientRect();
      const x = box.left - frame.left + host.scrollLeft - host.clientLeft;
      const y = box.top - frame.top + host.scrollTop - host.clientTop;
      setStyles(bar, {
        transition: animate && placed ? "" : "none",
        width: `${box.width}px`,
        height: `${box.height}px`,
        transform: `translate(${x}px, ${y}px)`,
        opacity: "1",
      });
      host.setAttribute("data-slide", "");
      placed = true;
    };
    place(false);
    const mutations = new MutationObserver(() => place(true));
    mutations.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "aria-current"] });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place(false));
    resize?.observe(host);
    Array.from(host.children).forEach((child) => resize?.observe(child));
    return () => {
      mutations.disconnect();
      resize?.disconnect();
    };
  }, [container, indicator, selector, eligible]);
}
