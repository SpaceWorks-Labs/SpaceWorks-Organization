/**
 * A full page load. Use it where the session changes (sign-in, sign-out, switching account) so no provider
 * loaded on a public page survives into a signed-in one. Soft navigations keep the document alive.
 */
export function hardNavigate(url: string) {
  window.location.assign(url);
}
