# Public page

Every organisation can have a public page at `/o/<slug>` that tells people who you are and how to join, built from safe sections.

## What it does

- The page lives at `/o/<slug>` and links to each open plan's join page (`/o/<slug>/join/<plan>`).
- Without a published page, `/o/<slug>` shows a plain page with the organisation's details and its plans. A suspended
  organisation's page still shows but takes no new members; other organisations that aren't running show not found.
- The editor is at **Settings → Public page** (`/dashboard/<org>/settings/public-page`).

### Sections

Build the page from up to 30 sections:

- **Welcome:** hero, call to action and about.
- **Membership:** plans, live counts, member card and numbers.
- **People and story:** committee, testimonials and story timeline.
- **Media:** image with text, video, gallery and downloads.
- **Information:** units, questions and answers, links, contact, map link and free text.

**Buttons** in the hero, call to action and image with text can go to a plan's join page (or to your plans when that
plan isn't open), the plans section, or a web link.

### Edit and publish

1. Open **Settings → Public page**.
2. Start from a template (Club, Alumni association, Professional association, Makerspace or community, Sports club,
   Cultural society), or from the starter page. A template fills your draft with sections and placeholder text to
   rewrite, and keeps your accent colour and cover. If the draft already has content, the editor asks before
   replacing it.
3. Add, duplicate, hide and remove sections. Reorder them by dragging the handle, with the move up and down buttons, or
   with Alt+Up and Alt+Down on a section's name.
4. Check the live preview in light or dark, at desktop or phone width. Sections with nothing to show are left out for
   visitors, and the preview says what's missing.
5. Changes stay a draft until you **publish**. You can discard the draft or unpublish the page. Leaving with unsaved
   changes asks first.

> **Tip:** The page can use the organisation's own accent colour. It is checked for readable contrast in both themes.

### Safety and privacy

- Text is written in a simple Markdown subset and shown as plain text, never as raw HTML.
- Links must be web, email or phone links.
- Images and downloads must be your own uploads, and an image from another organisation is refused. Images and PDFs
  are 5 MB at most; downloads are PDFs only, checked by their first bytes and served only as downloads.
- **Live counts** show aggregates only: current members (an active or grace membership) in total, by plan and by
  top-level unit. You choose which ones the section shows.
  - Names are never shown.
  - Any count under 5 is hidden. When one row of a breakdown is hidden, the next smallest is hidden too, so it can't
    be worked out from the total.
  - Counts are cached for a few minutes.
- The **member card** section draws your approved card design with a made-up name and number. It never uses a real
  member. It uses the organisation default design, otherwise your first plan's own design, otherwise the built-in
  design. Visitors can load the image only while the published page shows the section; staff can always load it in
  the editor's preview.
- **Videos** come from YouTube or Vimeo only.
  - Nothing loads from either site until a visitor presses play.
  - YouTube plays in its privacy-enhanced mode (youtube-nocookie.com) and Vimeo with do-not-track.
  - The page's security policy allows exactly those two players, on `/o/*` pages only.
- The **map link** opens Google Maps, OpenStreetMap, Apple Maps or Bing Maps. The page never embeds a map.
- Publishing, unpublishing and uploads are written to the audit log.

## Who can use it

| Task | Permission |
| --- | --- |
| Open the editor and preview | `org.settings` ◆ |
| Save drafts, publish, unpublish, upload images and PDFs | `org.settings` ◆, held for the whole organisation |
| Visit the published page | Anyone |

◆ Staff holding their role for one unit can open the editor but not change the page. The starter Manager role holds
`org.settings`; Treasurer and Viewer don't.

## Turning it on or off

- **Publish** and **Unpublish** decide whether your custom page shows. Unpublished, visitors see the plain page.
- Whether the organisation is listed in the directory at `/organisations` is a separate setting, made by the platform
  super admin. Unlisted organisations are still reached by their link.
- Each section can be hidden without removing it.
- An organisation's own outside analytics on its public pages is set under [web analytics](web-analytics.md).

## Screenshots

![Public page in the light theme](/screens/public-page-light.webp)

![Public page in the dark theme](/screens/public-page-dark.webp)

## API

There is no public REST API yet. The sample card image is `GET /api/o/<slug>/sample-card`; it and the other public
routes are listed in [webhooks and endpoints](../reference/webhooks-and-endpoints.md). The source is on
[GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).

## Related

- [Plans and join forms](plans-and-join-forms.md)
- [Member cards](member-cards.md) for the approved design the sample card draws
- [Organisations](organisations.md) for public and unlisted organisations
- [Web analytics](web-analytics.md) for visit counts and outside providers
- [Owner manual](../manuals/owners.md)
