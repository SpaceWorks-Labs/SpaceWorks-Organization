import { RouteTransition } from "@/components/motion/RouteTransition";
import styles from "@/components/public/motion/motion.module.css";

/**
 * The route transition for an organisation's public pages. The shared RouteTransition plays on a real page change
 * (never the first load) and moves focus to the new heading; the layout's tenant header sits outside and stays still.
 * The wrapper redirects the movement so a block holding the tenant logo never moves (motion.module.css). Reduced
 * motion: no movement.
 */
export default function PublicOrganisationTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.route}>
      <RouteTransition>{children}</RouteTransition>
    </div>
  );
}
