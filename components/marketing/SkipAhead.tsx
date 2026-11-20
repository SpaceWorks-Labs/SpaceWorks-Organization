"use client";

/**
 * A skip link to the next section, hidden until focused (`.skip-link`). It moves focus as well as scroll, so the
 * next Tab continues from the section it lands on.
 */
export function SkipAhead({ target, label }: { target: string; label: string }) {
  return (
    <a
      href={`#${target}`}
      className="skip-link"
      onClick={(event) => {
        const node = document.getElementById(target);
        if (!node) return;
        event.preventDefault();
        node.scrollIntoView({ block: "start" });
        if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
        node.focus({ preventScroll: true });
      }}
    >
      {label}
    </a>
  );
}
