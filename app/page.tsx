import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AreasSection } from "@/components/marketing/AreasSection";
import { CardShowcase } from "@/components/marketing/CardShowcase";
import { CloseSection, FaqSection } from "@/components/marketing/ClosingSections";
import { HeroSection } from "@/components/marketing/HeroSection";
import { LandingSplash } from "@/components/marketing/LandingSplash";
import { MembershipStory } from "@/components/marketing/MembershipStory";
import { OpenSourceSection } from "@/components/marketing/OpenSourceSection";
import { RevealRoot } from "@/components/motion/RevealRoot";
import { ScreensSection } from "@/components/marketing/ScreensSection";
import { SelfHostIsland } from "@/components/marketing/SelfHostIsland";
import { SkipAhead } from "@/components/marketing/SkipAhead";
import { entryTarget, isLandingEnabled } from "@/lib/features/landing";
import { loadOrganisationsDirectory } from "@/lib/views/app__organisations__page";
import "@/components/marketing/landing.css";

export const metadata: Metadata = {
  title: { absolute: "Space Works Organization · Open-source membership software" },
  description:
    "Free, self-hosted membership software for clubs, associations and federations: join forms and approvals, payments and GST receipts, member cards, renewals and reports.",
};

/**
 * "/" (product rules §12.1 and §12.2). With LANDING_ENABLED on (the default) it is the landing page: the hero, the
 * membership story, sample member cards, a headline per feature area, screenshots, self-hosting on the Deep Ink
 * island, the licence, questions and a closing call to action. Off, it follows the data through the directory's own reader, which
 * lists only public, active organisations.
 */
export default async function HomePage() {
  await connection();
  if (!isLandingEnabled()) {
    redirect(await entryTarget(() => loadOrganisationsDirectory({ searchParams: Promise.resolve({}) })));
  }

  return (
    <RevealRoot className="sw-land">
      <LandingSplash />
      <HeroSection />
      <SkipAhead target="areas" label="Skip the membership story" />
      <MembershipStory />
      <CardShowcase />
      <AreasSection />
      <ScreensSection />
      <SelfHostIsland />
      <OpenSourceSection />
      <FaqSection />
      <CloseSection />
    </RevealRoot>
  );
}
