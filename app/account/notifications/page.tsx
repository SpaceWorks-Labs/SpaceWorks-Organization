import type { Metadata } from "next";
import { loadAccountNotificationsView } from "@/lib/views/app__account__notifications__page";
import { AccountChannels } from "@/components/messaging/AccountChannels";
import { EmptyState, SectionHeading } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatUtcStamp } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Notifications" };

export default async function AccountNotificationsPage() {
  const { organisations, messages } = await loadAccountNotificationsView();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading as="h1" title="Notifications" description="Reminders and notices from your organisations always arrive by email. You can also get them on your phone or in a chat app, one organisation at a time." />
      {organisations.length === 0 ? <EmptyState title="Nothing to set up yet">When you join an organisation with this email address, its channels appear here.</EmptyState> : <AccountChannels organisations={organisations} />}
      <section className="flex flex-col gap-3">
        <SectionHeading as="h2" title="Recent messages" description="The last messages your organisations sent you, newest first. Times are in UTC." />
        {messages.length === 0 ? <EmptyState mood="sleepy" title="No messages yet">Reminders and notices you are sent appear here.</EmptyState> : (
          <Table label="Recent messages">
            <THead><tr><TH>Message</TH><TH>Organisation</TH><TH>Channel</TH><TH>Status</TH><TH>Date</TH></tr></THead>
            <TBody>
              {messages.map((message) => (
                <TR key={message.id}>
                  <TD className="text-ink">{message.kind}</TD>
                  <TD>{message.organisation}</TD>
                  <TD>{message.channel ?? "Not sent yet"}</TD>
                  <TD>{message.status}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{formatUtcStamp(message.when)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
