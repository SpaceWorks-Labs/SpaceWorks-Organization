"use client";

import { SegmentedControl } from "@/components/ui/choice";
import { useAppColorMode } from "@/components/providers";
import { AccountCard } from "@/components/account/AccountCard";
import { COLOR_MODE_OPTIONS, originOf } from "@/components/chrome/ColorModeToggle";
import type { ColorMode } from "@/lib/colorMode";

/** Colour mode for this browser: Light, Dark or System (CR-THEME-01). */
export function AccountAppearanceCard() {
  const { preference, setColorMode } = useAppColorMode();
  return (
    <AccountCard id="account-appearance" title="Appearance" description="Choose how Space Works Organization looks in this browser.">
      <div className="flex flex-col gap-2">
        <SegmentedControl<ColorMode>
          ariaLabel="Colour mode"
          value={preference}
          // The reveal grows from the segment just chosen (it has focus).
          onValueChange={(next) => setColorMode(next, originOf(document.activeElement))}
          options={COLOR_MODE_OPTIONS}
          className="self-start"
        />
        <p className="text-caption text-ink-muted">
          {preference === "system" ? "Matches your device's light or dark setting, and changes when it does." : "Saved in this browser only."}
        </p>
      </div>
    </AccountCard>
  );
}
