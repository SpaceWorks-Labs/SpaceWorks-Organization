# Updates and rollback

How a bundled install moves to a new release, what the updater checks on the way, and what a rollback can and cannot undo.

## Releases and tags

Releases are published from `main` and titled `Space Works Organization <version>`. The root `VERSION` file selects
the series, and each build is tagged `v<series>-main.<run>.<sha>`, for example `v0.9.0-main.42.a1b2c3d4e5f6` (the
SHA is 12 lowercase hex characters). That tag is what a deployment pins to. Pushes to `dev` publish staging images
tagged `dev` without a release, and the updater never installs them.

The installed release is recorded in `.spaceworks-version`, and the one before it in `.spaceworks-previous-version`.
The compose wrapper pins every command to `.spaceworks-version`, so images never change under you between updates.
What changed in each release is in the [changelog](../../../CHANGELOG.md).

## Update

```bash
bash scripts/update.sh --force                                    # newest main release
bash scripts/update.sh --force --version 0.9.0-main.42.a1b2c3d4e5f6
```

This is menu option 1 of the installer. `--version` takes the tag without its leading `v`. Only published,
non-prerelease `main` releases of the configured repository are accepted. If the release is already installed, the
updater says so and stops.

### What the updater does

1. **Takes the lock.** A directory lock (`.spaceworks-update.lock`) stops two updates at once, and with `flock` an
   operation lock also stops a backup or restore running at the same time.
2. **Finds the release** on GitHub and downloads its source into temporary storage.
3. **Hands over.** The new release's own `scripts/update.sh` does the rest, so every update runs the target release's
   updater and host files.
4. **Dumps the database** to `backups/pre-update-<time>.sql.gz`. If the dump is empty, the update is cancelled.
5. **Checks the new backend image can be pulled** before any host file changes.
6. **Installs the host files** listed in [`scripts/install-host-bundle.sh`](../../../scripts/install-host-bundle.sh)
   (compose files, `deploy/`, the setup and operations scripts), keeping each replaced file in
   `backups/host-config-<time>-<pid>/`. An archive missing any listed file is refused before anything is replaced.
7. **Pulls the images**, then starts the stack. The `migrate` service runs `prisma migrate deploy` once as the schema
   owner before the app starts; the app never starts on a half-migrated database.
8. **Waits up to five minutes** for every service to be healthy, then runs the operator checks (the `ops` role).
9. **Records the versions** and removes `pre-update` dumps older than 14 days and `host-config` folders older than 30.

### If an update fails

| Where it stops | What happens |
|---|---|
| Before the host files change (download, dump, image check) | Nothing is replaced; the running release carries on. |
| After the host files change, before deployment | The previous host files come back. |
| During deployment (unhealthy services or failed checks) | Automatic rollback: the previous host files and images come back, started with `--no-deps` so older migrations never run against the newer schema. The pre-update dump is kept. |

If the automatic rollback itself fails, the updater says so: restore the pre-update dump with `scripts/restore.sh`
and start the previous image tag by hand.

### A stuck lock

A lock left by a process that has died is recovered automatically. If the lock's process is still alive, or the lock
has no readable owner, the updater refuses. Check that no update is running, then:

```bash
bash scripts/update.sh --force --override-lock
```

## Roll back

```bash
bash scripts/update.sh --force --rollback
```

This is menu option 3. It returns to the release in `.spaceworks-previous-version`, replacing only the application
containers (`backend`, `worker`, `beat` and Caddy when present). It never runs migrations. `--version` and
`--rollback` cannot be used together.

### What a rollback can and can't undo

| Undone | Not undone |
|---|---|
| The application images | Database changes: new tables, columns and data written since the update stay |
| The host files (compose files, scripts, `deploy/`) | Emails and chat alerts already sent |
| Background-job containers the older release does not define (removed afterwards) | Payments settled with gateways in the meantime |

The previous release keeps working against the newer schema because migrations are written for it. For example,
migration `0017_rollback_safety` adds triggers that fill in the custom role and unit code the previous release does
not know about, and the old fixed role columns are still written for the same reason. These columns and triggers go
in a later release.

> **Warning:** To return the data as well, restore the pre-update dump the rollback prints, for example
> `bash scripts/restore.sh backups/pre-update-20261119T101500Z.sql.gz`. Anything written since the update is lost.
> See [Backups and restore](backups-and-restore.md#restore).

## Automatic deploys

Menu option 8 (`scripts/install-runner.sh`, `--remove` to take it away) installs a GitHub Actions runner on the
server. With the repository variable `SWO_DEPLOY=true`, the release workflow's `deploy` job runs
`update.sh --force --version <release>` on it after each release. The previous release's images are kept on the
registry for rollback.

## Other routes

- **Cloud:** `scripts/update.sh` is for the bundled stack only. Back up with your provider, set the new
  `SWO_IMAGE_TAG`, then run `scripts/spaceworks-compose.sh cloud pull` and `up -d --wait`. The `migrate` service runs
  the migrations. See [Deploying with managed services](../../DEPLOYMENT_CLOUD.md).
- **Render and similar platforms:** set `MIGRATE_ON_START=1` so the backend applies migrations before it starts, or
  run the image with `--role migrate` as a release step.
- **Netlify website:** redeploy the site after changing any `NEXT_PUBLIC_*` value; they are inlined at build time.
  See [Hosting the site on Netlify](../../DEPLOYMENT_NETLIFY.md).

## Read next

- [Deploying on a server](../../DEPLOYMENT_VPS.md#updates-and-rollback)
- [Monitoring and health](monitoring-and-health.md): check the stack after an update.
- [Architecture](../../ARCHITECTURE.md#releases): how releases and images are built.
