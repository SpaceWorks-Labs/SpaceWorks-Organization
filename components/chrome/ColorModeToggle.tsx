"use client";

import { useRef, type RefObject } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useAppColorMode } from "@/components/providers";
import { IconButton } from "@/components/ui/button";
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";
import { isColorMode, type ColorMode } from "@/lib/colorMode";

/** The three choices (CR-THEME-01), in the kit's order. */
export const COLOR_MODE_OPTIONS = [
  { value: "light", label: "Light", icon: <Sun aria-hidden /> },
  { value: "dark", label: "Dark", icon: <Moon aria-hidden /> },
  { value: "system", label: "System", icon: <Monitor aria-hidden /> },
] as const satisfies ReadonlyArray<{ value: ColorMode; label: string; icon: React.ReactNode }>;

const LABEL: Record<ColorMode, string> = { light: "Light", dark: "Dark", system: "System" };

/** The centre of an element, where the new mode's reveal starts. */
export function originOf(element: Element | null | undefined) {
  const rect = element?.getBoundingClientRect();
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
}

/**
 * Light, Dark and System as radio items, for a menu that is already open (the account menus in the app shell
 * and the super-admin bar). The reveal starts from `originRef`, the menu's trigger.
 */
export function ColorModeMenuItems({ originRef }: { originRef?: RefObject<Element | null> }) {
  const { preference, setColorMode } = useAppColorMode();
  return (
    <>
      <MenuLabel>Appearance</MenuLabel>
      <MenuRadioGroup value={preference} onValueChange={(next) => isColorMode(next) && setColorMode(next, originOf(originRef?.current))}>
        {COLOR_MODE_OPTIONS.map((option) => (
          <MenuRadioItem key={option.value} value={option.value} icon={option.icon}>
            {option.label}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </>
  );
}

/**
 * The colour-mode picker for headers (site header, organisation pages): an icon button showing the painted mode,
 * or a screen for System, that opens Light, Dark and System. Kept under its old name so callers need no change.
 */
export function ColorModeToggle({ variant = "quiet", size = "md" }: { variant?: "quiet" | "secondary"; size?: "sm" | "md" }) {
  const { mode, preference } = useAppColorMode();
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton ref={triggerRef} label={`Appearance: ${LABEL[preference]}`} variant={variant} size={size}>
          {/* The icons stay mounted and cross-rotate, so a change reads as one motion. */}
          <span aria-hidden className="relative inline-flex size-[18px]">
            <Sun className={`sw-mode-icon absolute inset-0 ${preference !== "system" && mode === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`} />
            <Moon className={`sw-mode-icon absolute inset-0 ${preference !== "system" && mode === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"}`} />
            <Monitor className={`sw-mode-icon absolute inset-0 ${preference === "system" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"}`} />
          </span>
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[200px]">
        <ColorModeMenuItems originRef={triggerRef} />
      </MenuContent>
    </Menu>
  );
}
