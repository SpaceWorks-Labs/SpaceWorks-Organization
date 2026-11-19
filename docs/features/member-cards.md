# Member cards

Each member gets an ID card they can show on a phone or print.

## What it does

- One live card per member and plan, with a QR code that opens a public check page.
- A card designer lets an organisation set colours, fonts and layout. Designs can differ by role.
- Managers save drafts. Only the Owner approves one, and members' cards keep the approved design until then.
- Card numbers follow a pattern you set, with a running sequence. Renewals keep the number.
- Cards are drawn on demand as PDF or PNG, so the two always match. They are never stored.
- Scanning a card as signed-in staff of that organisation shows the member record, inside their unit scope. Everyone else sees only whether the card is valid.
- Bulk downloads give a ZIP of PDFs or one combined PDF.

## Who can use it

- Issuing, reissuing and emailing cards needs `cards.manage`. Editing designs needs `cards.design`. Approving a design needs `cards.approve`, the Owner's alone.

## Turning it on or off

Cards are issued when a membership is first activated. The check page works whether or not the member portal is on.

## Screenshots

![Member cards in the light theme](/screens/member-cards-light.webp)

![Member cards in the dark theme](/screens/member-cards-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
