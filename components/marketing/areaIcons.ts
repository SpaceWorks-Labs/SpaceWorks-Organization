import {
  BarChart3, Bell, Building2, CreditCard, FileText, Globe, IdCard, KeyRound, Layers, LineChart, Network, RefreshCw, Server, ShieldCheck, UserRound, UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { DocsSlug } from "@/lib/features/catalog";

/** One icon per feature area, shared by the landing page's area headlines and /features. Decorative only. */
export const AREA_ICONS: Record<DocsSlug, LucideIcon> = {
  organisations: Building2,
  units: Network,
  groupings: Layers,
  "staff-and-roles": ShieldCheck,
  "sign-in": KeyRound,
  "plans-and-join-forms": UsersRound,
  renewals: RefreshCw,
  payments: CreditCard,
  "receipts-and-refunds": FileText,
  "member-cards": IdCard,
  "member-portal": UserRound,
  "public-page": Globe,
  "reports-and-analytics": BarChart3,
  notifications: Bell,
  "web-analytics": LineChart,
  "self-hosting": Server,
};
