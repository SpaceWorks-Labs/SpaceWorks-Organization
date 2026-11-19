// Super-admin accounts, managed only from the server. Super admins sign in with email and password; the
// password is set here and never by email or in the app.
//   node docker/ops/admin.mjs create --email you@example.org [--name "Your name"] [--password-stdin]
//   node docker/ops/admin.mjs set-password --email you@example.org [--password-stdin]
//   node docker/ops/admin.mjs reset-mfa --email you@example.org
//   node docker/ops/admin.mjs revoke --email you@example.org
//   node docker/ops/admin.mjs list
//   node docker/ops/admin.mjs login-methods --show | --set google,apple,github   (password, google, apple, github, oidc, saml, supabase, firebase, or none)
//   node docker/ops/admin.mjs promote-bootstrap   (run after migrations; see promoteBootstrap)
// On a Compose install, run it through scripts/admin.sh, which starts it in the ops container.
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const [command, ...rest] = process.argv.slice(2);
const option = (name) => { const index = rest.indexOf(`--${name}`); return index >= 0 ? rest[index + 1] : undefined; };
const flag = (name) => rest.includes(`--${name}`);
const fail = (message, code = 1) => { console.error(`[admin] ${message}`); process.exit(code); };
const say = (message) => console.log(`[admin] ${message}`);

function emailArg() {
  const email = option("email")?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) fail("Give an email address with --email.", 64);
  return email;
}

function checkPassword(password) {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 128 || Buffer.byteLength(password, "utf8") > 72) return "Use at most 72 bytes (fewer characters).";
  return null;
}

/** Same rule as the app (lib/breachedPassword.ts): only a 5-character hash prefix leaves the server. */
async function breached(password) {
  if (process.env.PWNED_PASSWORDS_CHECK === "0") return false;
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return false;
    return (await response.text()).split(/\r?\n/).some((line) => { const [suffix, count] = line.trim().split(":"); return suffix === hash.slice(5) && Number(count) > 0; });
  } catch {
    return false;
  }
}
const BREACHED = "That password has appeared in a data breach, so it's easy to guess. Choose a different one.";

/** Read a line without echoing it when attached to a terminal. */
function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (hidden && process.stdin.isTTY) rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(question); };
    rl.question(question, (answer) => { rl.close(); if (hidden && process.stdin.isTTY) process.stdout.write("\n"); resolve(answer); });
  });
}

async function readPassword() {
  if (flag("password-stdin")) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
    const problem = checkPassword(password);
    if (problem) fail(problem, 65);
    if (await breached(password)) fail(BREACHED, 65);
    return password;
  }
  if (!process.stdin.isTTY) fail("Run it in a terminal, or pass the password on standard input with --password-stdin.", 64);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const password = await ask("New password: ", true);
    const problem = checkPassword(password);
    if (problem) { console.error(problem); continue; }
    if ((await ask("Repeat it: ", true)) !== password) { console.error("The two didn't match."); continue; }
    if (await breached(password)) { console.error(BREACHED); continue; }
    return password;
  }
  return fail("No password set.", 65);
}

async function audit(action, user) {
  await prisma.auditEvent.create({ data: { action, actorUserId: null, targetType: "User", targetId: user.id, metadata: { via: "server" } } });
}

/** Set the password, verify the address and sign the account out everywhere. */
async function setPassword(user, password) {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, emailVerified: user.emailVerified ?? new Date(), sessionVersion: { increment: 1 } } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.verificationToken.deleteMany({ where: { identifier: { in: [`reset:${user.email}`, `mfa:${user.id}`] } } }),
  ]);
}

async function create() {
  const email = emailArg();
  const name = option("name")?.trim().slice(0, 120) || null;
  const password = await readPassword();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) user = await prisma.user.create({ data: { email, name, emailVerified: new Date(), isSuperAdmin: true } });
  else await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true, ...(name ? { name } : {}) } });
  await setPassword(user, password);
  await audit("SUPER_ADMIN_CREATED_ON_SERVER", user);
  say(`${email} is a super admin. Sign in at /login with this email and password, then open /super-admin.`);
}

async function superAdmin(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.isSuperAdmin) fail(`${email} isn't a super admin. Use "create" to make one.`, 66);
  return user;
}

const METHOD_FIELDS = { password: "passwordSignIn", google: "googleSignIn", apple: "appleSignIn", github: "githubSignIn", oidc: "oidcSignIn", saml: "samlSignIn", supabase: "supabaseSignIn", firebase: "firebaseSignIn" };

/** Which sign-in methods are switched on. A switch only gates a method that is also configured; off never deletes credentials. */
async function loginMethods() {
  const row = await prisma.instanceSetting.findUnique({ where: { id: "global" } });
  // Password is on by default and every other method is off until switched on (product rules section 15).
  const current = (method) => row?.[METHOD_FIELDS[method]] ?? method === "password";
  if (flag("show") || option("set") === undefined) {
    const forced = process.env.LOGIN_METHODS?.trim();
    if (forced) say(`The server's LOGIN_METHODS decides: ${forced}`);
    for (const method of Object.keys(METHOD_FIELDS)) console.log(`${method}	${current(method) ? "on" : "off"}`);
    return say("Super admins always sign in with a password, whatever the password switch says.");
  }
  const words = option("set").split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
  const unknown = words.filter((word) => word !== "none" && !(word in METHOD_FIELDS));
  if (unknown.length || words.length === 0) fail(`Use a comma list of ${Object.keys(METHOD_FIELDS).join(", ")}, or none.`, 64);
  const data = Object.fromEntries(Object.entries(METHOD_FIELDS).map(([method, field]) => [field, words.includes(method)]));
  const changed = Object.entries(METHOD_FIELDS).filter(([method, field]) => current(method) !== data[field]).map(([, field]) => field);
  await prisma.instanceSetting.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: data });
  await prisma.auditEvent.create({ data: { action: "LOGIN_METHODS_UPDATED", actorUserId: null, targetType: "InstanceSetting", targetId: "global", metadata: { via: "server", changed: changed.join(",") } } });
  say(`Sign-in methods on: ${words.filter((word) => word !== "none").join(", ") || "none"}. Each also needs its configuration to work.`);
}

async function main() {
  switch (command) {
    case "create": return create();
    case "set-password": {
      const user = await superAdmin(emailArg());
      await setPassword(user, await readPassword());
      await audit("SUPER_ADMIN_PASSWORD_SET_ON_SERVER", user);
      return say(`Password changed for ${user.email}; every session was signed out.`);
    }
    case "reset-mfa": {
      const user = await superAdmin(emailArg());
      await prisma.user.update({ where: { id: user.id }, data: { mfaSecretEncrypted: null, mfaEnabledAt: null, recoveryCodeHashes: [], sessionVersion: { increment: 1 } } });
      await audit("SUPER_ADMIN_MFA_RESET_ON_SERVER", user);
      return say(`Two-step sign-in removed from ${user.email}.`);
    }
    case "revoke": {
      const user = await superAdmin(emailArg());
      await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: false, sessionVersion: { increment: 1 } } });
      await audit("SUPER_ADMIN_REVOKED_ON_SERVER", user);
      return say(`${user.email} is no longer a super admin.`);
    }
    case "list": {
      const admins = await prisma.user.findMany({ where: { isSuperAdmin: true }, orderBy: { createdAt: "asc" }, select: { email: true, createdAt: true, passwordHash: true } });
      if (admins.length === 0) return say("No super admins yet. Create one with: create --email you@example.org");
      for (const admin of admins) console.log(`${admin.email}\tsince ${admin.createdAt.toISOString().slice(0, 10)}\t${admin.passwordHash ? "password set" : "no password"}`);
      return;
    }
    case "login-methods": return loginMethods();
    case "promote-bootstrap": return promoteBootstrap();
    default: fail("Use create, set-password, reset-mfa, revoke, list or login-methods (each with --email, except list and login-methods).", 64);
  }
}

/**
 * Upgrades from releases where signing up with SUPER_ADMIN_EMAIL granted the panel: keep that account a super
 * admin, once. Only while no super admin exists, and only for an account that existed before the release that
 * ended sign-up promotion (migration 0011), so a sign-up made afterwards can never claim it.
 */
async function promoteBootstrap() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || (await prisma.user.count({ where: { isSuperAdmin: true } })) > 0) return;
  const [cutoff] = await prisma.$queryRaw`SELECT "finished_at" FROM "_prisma_migrations" WHERE "migration_name" = '0011_notifications' AND "finished_at" IS NOT NULL`;
  if (!cutoff) return;
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, emailVerified: { not: null }, createdAt: { lt: cutoff.finished_at } } });
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
  await audit("SUPER_ADMIN_KEPT_ON_UPGRADE", user);
  say(`${user.email} stays a super admin. Its password is now managed on the server (scripts/admin.sh).`);
}

main()
  .catch((error) => { console.error(`[admin] ${error instanceof Error ? error.message : "Failed."}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
