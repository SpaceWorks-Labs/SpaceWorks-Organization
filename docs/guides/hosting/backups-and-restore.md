# Backups and restore

How the bundled stack backs up its database, files and settings, how to send encrypted copies off the server, and how to restore and rehearse a restore.

## What runs on its own

The bundled stack (see [Choose your hosting](choose-your-hosting.md)) backs itself up into `backups/` in the install
directory, which is owner-only (mode 700).

| Backup | Made by | File | Kept |
|---|---|---|---|
| Scheduled database dump | The `backup` service, every `BACKUP_INTERVAL_HOURS` (24) | `backups/scheduled-<time>.sql.gz` | `BACKUP_RETENTION_DAYS` (14) |
| Bucket mirror | The `backup-storage` service, on the same interval | `backups/storage/` | One mirror, refreshed each run |
| Before an update | `scripts/update.sh` | `backups/pre-update-<time>.sql.gz` | 14 days |
| Before a restore | `scripts/restore.sh` | `backups/pre-restore-<time>.sql.gz` | Until you delete it |
| Before a settings change | `scripts/vps-reconfigure.sh` (menu option 6) | a `pre-settings` dump | Until you delete it |

Times are UTC, written as `YYYYMMDDTHHMMSSZ`. The bucket itself has versioning on; the mirror follows it, so a file
removed from the bucket also leaves the mirror on its next run.

## Back up now

```bash
bash scripts/backup.sh                          # dump, bucket mirror and settings archive
bash scripts/backup.sh --no-storage             # dump only
bash scripts/backup.sh --prefix before-import   # name the dump before-import-<time>.sql.gz
```

This is also menu option 2 of the installer. The stack keeps running. Without `--prefix`, the dump is
`backups/manual-<time>.sql.gz` and the script also archives `.env`, `tls/` and `backup.env` (when present) to
`backups/config-<time>.tar.gz`. A prefix is a short lowercase name (a letter, then up to 30 letters, digits or
hyphens).

> **Warning:** Backups contain every secret: database contents, `.env` keys and the private CA. Copy them off the
> server only encrypted. Without `MFA_ENCRYPTION_KEY` and `PAYMENT_SECRETS_KEY` from `.env`, saved authenticator seeds
> and gateway keys cannot be read after a restore.

## What is and isn't in a backup

| Included | Not included |
|---|---|
| The whole database: organisations, members, payments, receipts, audit log, outbox | Files in an external bucket (`SWO_STORAGE='external'`): back them up with your storage provider |
| Uploaded files in the bundled Silo bucket (the mirror) | Redis: rate limits, the read cache and queue entries. The SQL outbox stays the record, and beat recreates the schedules when it starts |
| `.env`, `tls/` and `backup.env` (settings archive and off-site copies) | The off-site private key: it is shown once and never stored on the server |
| | Member cards: they are drawn on demand from live data and never stored |

On the [cloud route](../../DEPLOYMENT_CLOUD.md) none of these scripts run: use your database provider's
point-in-time recovery or snapshots, and your bucket's versioning.

## Change the schedule

Menu option 5 (`scripts/vps-backup-settings.sh`) shows the current settings and changes:

1. how often the database is backed up (`BACKUP_INTERVAL_HOURS`, 1 to 168 hours);
2. how many days scheduled dumps stay (`BACKUP_RETENTION_DAYS`);
3. the encryption key;
4. off-site copies;
5. sending an off-site copy now;
6. listing off-site copies.

The interval and retention are written to `.env`, and the services that read them restart.

## Encrypted off-site copies

Off-site copies are sent encrypted only, so turn on encryption first. Option 5 makes an
[age](https://age-encryption.org) key: the public half (`BACKUP_AGE_RECIPIENT`) is saved in `backup.env`, and the
private half is shown once. Keep it in a password manager. Then give it an S3-compatible bucket at another provider
and a key limited to that bucket. It checks the bucket is reachable and, with systemd, schedules
`sworg-offsite-backup.timer` every night at about 03:30 UTC. Without systemd, run the script from cron.

Each run of [`scripts/vps-offsite-backup.sh`](../../../scripts/vps-offsite-backup.sh) uploads a folder named after
its UTC time:

| File | Contents |
|---|---|
| `database.sql.gz.age` | A fresh dump, taken while the stack runs |
| `settings.tar.gz.age` | `.env`, `tls/`, `backup.env` and `offsite-ca.crt` when present |
| `storage.tar.age` | The bucket mirror (bundled Silo only) |

Copies older than `OFFSITE_KEEP_DAYS` (90 unless you choose otherwise) are removed from the bucket. The result of the
last run is written to `backups/offsite-status` and shown by option 4. The off-site settings are listed in
[Configuration](../../CONFIGURATION.md#backup-settings-backup-env).

> **Note:** Making a new key does not re-encrypt copies already sent. Keep the previous private key until those
> copies have aged out.

## Restore

```bash
bash scripts/restore.sh backups/scheduled-20261020T020000Z.sql.gz                 # database only
bash scripts/restore.sh backups/manual-20261020T090000Z.sql.gz --with-storage     # and the files
```

[`scripts/restore.sh`](../../../scripts/restore.sh) accepts only a dump made by `backup.sh` or the backup service,
inside `backups/`. It then:

1. asks you to type `RESTORE` (or pass `--yes` when there is no terminal);
2. takes a `pre-restore` dump of the current database;
3. stops the app, worker, beat, web edge and backup service, so the site is offline;
4. replaces the database schema with the dump in one transaction, keeping the runtime role's rights;
5. with `--with-storage`, copies `backups/storage` back into the bucket (newer files in the bucket are kept);
6. starts everything again and waits up to five minutes for it to be healthy.

If a step fails, the services are started again. Migrations bring an older dump up to the running release.
`--with-storage` is refused when files live in an external bucket.

### From an off-site copy

```bash
bash scripts/vps-offsite-backup.sh --fetch 20261029T033012Z      # into backups/offsite/20261029T033012Z/
cd backups/offsite/20261029T033012Z
age -d -i key.txt database.sql.gz.age > ../../offsite-20261029T033012Z.sql.gz
age -d -i key.txt settings.tar.gz.age | tar -xz -C /somewhere/private
age -d -i key.txt storage.tar.age | tar -x -C /somewhere/private
bash scripts/restore.sh backups/offsite-20261029T033012Z.sql.gz
```

Remove `key.txt` from the server afterwards.

### On a new server

Install with the same answers, stop the stack, put the old `.env` and `tls/` back from the settings archive (or the
off-site `settings.tar.gz.age`), start it, then restore the dump, with `--with-storage` once the files are back in
`backups/storage`. See [Restore on a new server](../../DEPLOYMENT_VPS.md#restore-on-a-new-server).

## Rehearse a restore

A backup you have never restored is a guess. Every few months:

1. Fetch the newest off-site copy and decrypt it on a spare machine.
2. Install there, restore the dump and sign in.
3. Check recent members, payments, receipts and uploads.
4. In **Super admin → Operations**, select **Record restore drill**.

Recording a drill writes the audit action `BACKUP_RESTORE_VERIFIED` (see [Audit actions](/docs/audit-actions)), and
the Operations page shows when the last one happened.

## Backup status in the app

**Super admin → Operations** shows a provider, the last successful backup (fresh if within 26 hours) and the
retention. These are records, not checks: set them in **Super admin → Settings** (Email and backups), or with
`BACKUP_PROVIDER`, `BACKUP_LAST_SUCCESS_AT` and `BACKUP_RETENTION_DAYS`. On the bundled stack, the real state is in
`bash scripts/vps-status.sh` (see [Monitoring and health](monitoring-and-health.md)).

## Read next

- [Deploying on a server](../../DEPLOYMENT_VPS.md#backups-and-restore)
- [Updates and rollback](updates-and-rollback.md): every update takes a dump first.
- [Free hosting behind Cloudflare](../../DEPLOYMENT_CLOUDFLARE.md): off-site copies to a second R2 bucket.
- [Limits](../../reference/limits.md): retention defaults.
