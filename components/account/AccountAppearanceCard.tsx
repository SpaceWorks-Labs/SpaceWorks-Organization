"use client";

import { Moon, Sun } from "lucide-react";
import { SegmentedControl } from "@/components/ui/choice";
import { useAppColorMode } from "@/components/providers";
import { AccountCard } from "@/components/account/AccountCard";
import type { ColorMode } from "@/lib/colorMode";

const OPTIONS = [
  { value: "light", label: "Light", icon: <Sun aria-hidden /> },
  { value: "dark", label: "Dark", icon: <Moon aria-hidden /> },
] as const satisfies ReadonlyArray<{ value: ColorMode; label: string; icon: React.ReactNode }>;

/** Colour mode for this browser: Light or Dark (owner decision 2026-11-19; no System). */
export function AccountAppearanceCard() {
  const { mode, setColorMode } = useAppColorMode();
  return (
    <AccountCard id="account-appearance" title="Appearance" description="Choose how Space Works Organization looks in this browser.">
      <div className="flex flex-col gap-2">
        <SegmentedControl<ColorMode>
          ariaLabel="Colour mode"
          value={mode}
          // The reveal grows from the segment just chosen (it has focus).
          onValueChange={(next) => setColorMode(next, document.activeElement)}
          options={OPTIONS}
          className="self-start"
        />
        <p className="text-caption text-ink-muted">Saved in this browser only.</p>
      </div>
    </AccountCard>
  );
}
