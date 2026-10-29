"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ShellOrganisation } from "@/lib/appShell";
import { Callout } from "@/components/ui/display";

type Slot = { organisation: ShellOrganisation | null; set: (organisation: ShellOrganisation | null) => void };

const PlatformOrganisationContext = createContext<Slot>({ organisation: null, set: () => undefined });

/**
 * A platform super admin isn't on most organisations' teams, so the sidebar can't list the one they are in. The
 * organisation's layout registers it here while they are inside it.
 */
export function PlatformOrganisationProvider({ children }: { children: ReactNode }) {
  const [organisation, set] = useState<ShellOrganisation | null>(null);
  return <PlatformOrganisationContext.Provider value={{ organisation, set }}>{children}</PlatformOrganisationContext.Provider>;
}

export function usePlatformOrganisation() {
  return useContext(PlatformOrganisationContext).organisation;
}

/** Shown on every page of an organisation a super admin is in through platform access, and registers it with the sidebar. */
export function PlatformAccessBanner({ organisation }: { organisation: ShellOrganisation }) {
  const { set } = useContext(PlatformOrganisationContext);
  useEffect(() => {
    set(organisation);
    return () => set(null);
  }, [organisation, set]);
  return <Callout tone="warning" role="status">You&apos;re in {organisation.name} as platform super admin. Everything you do here is recorded in its audit log.</Callout>;
}
