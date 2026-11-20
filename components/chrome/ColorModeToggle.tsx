"use client";

import type { RefObject } from "react";
import { Moon, Sun } from "lucide-react";
import { useAppColorMode } from "@/components/providers";
import { IconButton } from "@/components/ui/button";
import { MenuCheckboxItem } from "@/components/ui/menu";

/**
 * "Dark theme" as one checkbox item, for a menu that is already open (the account menus in the app shell and the
 * super-admin bar). Light and Dark only (owner decision 2026-11-19). The reveal grows from `originRef`, the trigger.
 */
export function ColorModeMenuItem({ originRef }: { originRef?: RefObject<Element | null> }) {
  const { mode, setColorMode } = useAppColorMode();
  return (
    <MenuCheckboxItem checked={mode === "dark"} onCheckedChange={(on) => setColorMode(on ? "dark" : "light", originRef?.current)} icon={<Moon aria-hidden />}>
      Dark theme
    </MenuCheckboxItem>
  );
}

/**
 * The light/dark toggle for headers (site header, organisation pages), after the kit's theme toggle (v2.5.1): one
 * treatment in both themes (panel fill, control-outline boundary, ink icon, ink boundary on hover, the global focus
 * ring), the sun or moon showing the theme that is on, and `aria-pressed` saying whether Dark is on. Clicking plays
 * the theme reveal from the button (instant under reduced motion).
 */
export function ColorModeToggle({ size = "md" }: { size?: "sm" | "md" }) {
  const { mode, toggleColorMode } = useAppColorMode();
  const dark = mode === "dark";
  return (
    <IconButton
      label="Dark theme"
      aria-pressed={dark}
      variant="secondary"
      size={size}
      className="border-line-strong hover:border-ink hover:bg-panel"
      onClick={(event) => toggleColorMode(event.currentTarget)}
    >
      {dark ? <Moon aria-hidden /> : <Sun aria-hidden />}
    </IconButton>
  );
}
