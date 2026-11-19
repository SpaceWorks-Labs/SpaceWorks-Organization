/**
 * The session cookie's name. Cookies ignore ports, so in development several servers on localhost (one per
 * worktree, each with its own secret) would overwrite each other's sign-in; the port keeps them apart.
 * Production serves one origin, so the name stays fixed there.
 */
export function sessionCookieName(env: NodeJS.ProcessEnv = process.env) {
  const base = "swo.session-token.v1";
  if (env.NODE_ENV === "production") return base;
  try {
    const port = new URL(env.AUTH_URL || env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").port;
    return port ? `${base}.${port}` : base;
  } catch {
    return base;
  }
}
