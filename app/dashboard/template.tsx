import { RouteTransition } from "@/components/motion/RouteTransition";

/** Content-area route transition (components/motion/RouteTransition.tsx): the shell around it stays still. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
