# Public page

Every organisation can have a public page at `/o/<slug>` that tells people who you are and how to join.

## What it does

- A sections editor builds the page from blocks of text, links, images and plans.
- Text is written in a simple Markdown subset and is shown as plain text, never as raw HTML. Links must be web, email or phone links.
- Images must be your own uploads.
- Changes are kept as a draft until you publish. You can discard changes or unpublish.
- The page can use the organisation's own accent colour, checked for readable contrast.

## Who can use it

Editing the page needs `org.settings`.

## Turning it on or off

Publish and Unpublish control whether the page is visible. Whether the organisation is listed in the directory is a separate setting.

## Screenshots

![Public page in the light theme](/screens/public-page-light.webp)

![Public page in the dark theme](/screens/public-page-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
