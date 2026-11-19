# Notifications

Members and the team hear about what matters, by email and chat.

## What it does

- Member emails, such as notices, reminders, receipts and cards, go out in the organisation's name.
- An organisation can use its own SMTP, Amazon SES, Resend or Postmark account, or fall back to the platform's. A test email checks the settings before they are saved, and addresses that bounce or complain are not emailed again.
- Organisations can change the wording of member emails with plain-text templates and placeholders.
- Team chat alerts go to Slack, Discord, Mattermost, Telegram, WhatsApp or a signed webhook. Alerts cover new applications, payments, refund and erasure requests, and a monthly summary.
- Messages are queued with the change that causes them, so a failed change never sends anything.

## Who can use it

Email and chat settings are managed by Owners and Managers.

## Turning it on or off

Each chat channel picks its own alerts and can be switched off. The organisation's own email settings can be turned on or off, and a test email checks them.

## Screenshots

![Notifications in the light theme](/screens/notifications-light.webp)

![Notifications in the dark theme](/screens/notifications-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
