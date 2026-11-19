# Web analytics

Optional outside analytics, available in 0.9.0.

## What it does

- Outside providers, such as Plausible, Umami, Google Analytics 4, PostHog and Mixpanel, are all off by default.
- With no provider set up, no script loads, no request is made and nothing is stored.
- Scripts load only after a visitor agrees in the consent banner, and withdrawing consent stops them at once.
- Only page route templates are sent, never free text, query strings, names or email addresses.
- The platform operator can set up providers for the whole site, and each organisation can set up its own for its public pages.
- An organisation's own providers run only on its own public pages and join forms, only for signed-out visitors who agree. The platform's providers do not run there, so a page never runs two page-analytics providers.
- Space Works also counts visits itself, always, with no cookie and no personal data: just how many views each kind of public page had each day. These counts need no consent and appear under Reports, Web visits.

## Who can use it

The platform super admin for the whole site, and the organisation's owner for its own public pages (settings, Web analytics). A super admin can also set up any organisation's. Visit counts are read by anyone who can read membership reports.

## Turning it on or off

Switch a provider on by saving its public identifier in settings. Remove it to switch it off. Outside hosts must first be approved by the operator, and Mixpanel is set by the operator only. An organisation's public page lists the providers it uses and links to Privacy preferences.

## Screenshots

![Web analytics in the light theme](/screens/web-analytics-light.webp)

![Web analytics in the dark theme](/screens/web-analytics-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
