# Sign-in

How people sign in: email and password, Google, Apple, GitHub, any OpenID Connect provider, SAML 2.0, and optional Supabase or Firebase accounts.

## What it does

- People sign in with an email and password. Every other way is off until the person running the platform switches it on.
- The sign-in page shows the buttons for the methods that are on first, then an "or" line, then the email and password fields.
- Supabase and Firebase can be used as identity providers too. They open their own sign-in, and this site accepts the result only when the provider confirms the email address. They sign in the accounts they created here: an email that already has an account must keep signing in the way it does now. Keep "Confirm email" on in the Supabase project.
- OpenID Connect and SAML providers are added by the platform's super admin, any number of them. Like Supabase and Firebase, they never take over an existing account by email: if that email already has an account, the sign-in is refused and the person signs in the usual way.
- Google, Apple and GitHub can join an existing account by its verified email. A sign-in with no verified email, such as a phone number alone, is refused.
- New browsers are remembered, and a first sign-in from a new device sends an alert. Accounts without an authenticator get an emailed code from a browser they haven't used, when the platform can send email.
- Several wrong passwords for one email address slow that address down for a while (15 seconds, doubling up to 15 minutes), whether or not an account exists.
- Staff still need an authenticator before the dashboard opens, whichever method they used.
- Super admins always sign in with an email and password set on the server. They have no passkeys.
- Passkeys sign people in with a fingerprint, face or screen lock. Add one under Security in your account while signed in; the sign-in page then shows "Sign in with a passkey" and suggests passkeys in the email field. Staff with an authenticator still enter its code after a passkey. You can rename and remove passkeys, but not the last way you have to sign in.
- Without an email service, "Forgot password?" is hidden and an administrator resets the password.
- Under Security in your account, "Signed-in devices" lists the browsers and devices signed in to you, with the way each signed in, a rough place and when it was last used. Sign any of them out, or sign out everywhere. Ending a device signs it out on its next page load.
- "Sign-in methods" shows every way you can sign in. Add Google, GitHub, a company single sign-on, SAML, Supabase or Firebase while you are signed in: it links that account to yours (it never links by email address, and never takes an account that already belongs to someone else). Remove any you no longer want, as long as another way to sign in remains. Super admins sign in with a password only.
- With an authenticator app on, you can replace your recovery codes under Security by entering a current code from the app. The old codes stop working.

## Who can use it

Everyone signs in. The platform super admin chooses which methods are offered, under Auth in the super-admin area. The person running the server can set the list at install time or with the admin command.

## Methods

| Method | Default | Set up by |
| --- | --- | --- |
| Email and password | On | Nothing to set up |
| Google | Off | Client id and secret, in Super admin settings or the server environment |
| Apple | Off | Services ID, team ID, key ID and key |
| GitHub | Off | Client id and secret |
| OpenID Connect | Off | Add providers under Auth: issuer, client id, secret, scopes |
| SAML 2.0 | Off | Add providers under Auth: entity id, sign-on address, certificate |
| Supabase, Firebase | Off | Public project values in the server environment |
| Passkeys | Off | Nothing to set up; people add their own. They work only on the site address they were created for |
| Phone code | Off | An SMS provider (Twilio or MSG91) under Auth → SMS, or in the server environment |

## Phone codes

With phone codes on and an SMS provider set up, people can add a phone number on their account page (Security): they type it with its country code, get a six-digit code by text, and confirm it. After that, "Sign in with a phone code" on the sign-in page texts a code to that number. The code works once, for 10 minutes, with five tries. It never creates an account, a number belongs to one account, and super admins sign in with a password only. If your account has an authenticator app, you enter its code as well. You can't remove your phone if it is your only way to sign in.

The sign-in page answers the same way for every number ("If this number belongs to an account, we've sent a code"), and asking for too many codes for one number, one country or one address is refused with a wait. It works even when no email service is set up.

## Turning it on or off

Each method has a switch. A method works only when its switch is on and it has been set up, so switching one on never makes an unconfigured method work, and switching one off keeps its credentials. For OpenID Connect and SAML, each provider also has its own Enabled switch. A method that is off is hidden everywhere and refuses sign-ins. If the server fixes the list, the switches show as set by the server and can't be changed in the app. With email and password off, the sign-in page hides the password form and sign-up, and super admins reach theirs from the Super admin sign-in link.

## Screenshots

![Sign-in in the light theme](/screens/sign-in-light.webp)

![Sign-in in the dark theme](/screens/sign-in-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
