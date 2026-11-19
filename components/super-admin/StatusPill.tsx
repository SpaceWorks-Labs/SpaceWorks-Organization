import { CircleCheck, CircleDashed, CircleOff, TriangleAlert } from "lucide-react";
import { Chip } from "@/components/ui/display";

export type ServiceState = "available" | "switched_off" | "not_set_up" | "unavailable";

/** The four words every settings panel uses for a method or provider, each a solid mark plus an icon (CR-STATUS-01). */
const STATES: Record<ServiceState, { label: string; tone: "success" | "neutral" | "info" | "warning"; Icon: typeof CircleCheck }> = {
  available: { label: "Available", tone: "success", Icon: CircleCheck },
  switched_off: { label: "Switched off", tone: "neutral", Icon: CircleOff },
  not_set_up: { label: "Not set up", tone: "info", Icon: CircleDashed },
  unavailable: { label: "Unavailable", tone: "warning", Icon: TriangleAlert },
};

export function StatusPill({ state, size = "md" }: { state: ServiceState; size?: "sm" | "md" }) {
  const { label, tone, Icon } = STATES[state];
  return <Chip tone={tone} size={size} icon={<Icon />}>{label}</Chip>;
}
