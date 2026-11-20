import { loadAccountProfileView } from "@/lib/views/app__account__profile__page";
import type { Metadata } from "next";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import { AccountEmailCard } from "@/components/account/AccountEmailCard";
import { AccountAppearanceCard } from "@/components/account/AccountAppearanceCard";
import { SectionHeading } from "@/components/ui/display";

export const metadata: Metadata = { title: "Your profile" };

export default async function AccountProfilePage() {
  const { user } = await loadAccountProfileView();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading as="h1" title="Profile" description="Your name, photo, email and how the app looks for you." />
      <AccountProfileForm
        initialName={user.name ?? ""}
        email={user.email}
        image={user.image}
        profileImageUrl={user.profileImageUrl}
      />
      <AccountEmailCard
        email={user.email}
        verified={Boolean(user.emailVerified)}
        // Resending only applies to password accounts (see resendEmailVerification); only a boolean leaves the server.
        canResend={user.hasPassword}
      />
      <AccountAppearanceCard />
    </div>
  );
}
