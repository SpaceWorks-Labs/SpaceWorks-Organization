"""Unit tests for scripts/ghcr-retention.py: python3 -m unittest discover -s tests/scripts"""

from __future__ import annotations

import importlib.util
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "ghcr-retention.py"
spec = importlib.util.spec_from_file_location("ghcr_retention", SCRIPT)
assert spec and spec.loader
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)

NOW = datetime(2026, 10, 25, 18, 0, tzinfo=timezone.utc)
OLD = NOW - timedelta(days=3)
PROTECTED = retention.retention_identifiers("0.7.0-main.9.abc", "sha-abc", "0.7", "0.7.0-main.8.def")


def version(digest: str, *tags: str, created_at: datetime = OLD):
    return retention.PackageVersion(f"id-{digest}", digest, frozenset(tags), created_at)


class DigestsToDeleteTest(unittest.TestCase):
    def test_keeps_protected_roots_and_their_children(self):
        versions = [version("root", "latest"), version("amd64"), version("arm64"), version("stale")]
        deleted = retention.digests_to_delete(versions, PROTECTED, {"root": ["amd64", "arm64"]}, NOW)
        self.assertEqual(deleted, frozenset({"stale"}))

    def test_keeps_untagged_versions_another_run_pushed_moments_ago(self):
        # A dev run pushes its platform images by digest while a main release prunes.
        fresh = NOW - timedelta(minutes=5)
        versions = [version("root", "main"), version("dev-amd64", created_at=fresh), version("dev-arm64", created_at=fresh)]
        self.assertEqual(retention.digests_to_delete(versions, PROTECTED, {"root": []}, NOW), frozenset())

    def test_deletes_untagged_versions_once_they_pass_the_minimum_age(self):
        versions = [version("orphan", created_at=NOW - retention.MIN_AGE)]
        self.assertEqual(retention.digests_to_delete(versions, PROTECTED, {}, NOW), frozenset({"orphan"}))


class ListPackageVersionsTest(unittest.TestCase):
    def listing(self, output: str):
        return retention.list_package_versions("owner", "pkg", runner=lambda _command: output, sleeper=lambda _s: None)

    def test_parses_tags_and_creation_time(self):
        rows = self.listing("1\tsha256:a\tlatest,main\t2026-10-25T17:40:00Z\n2\tsha256:b\t\t2026-10-25T17:41:00Z\n")
        self.assertEqual(rows[0].tags, frozenset({"latest", "main"}))
        self.assertEqual(rows[1].tags, frozenset())
        self.assertEqual(rows[1].created_at, datetime(2026, 10, 25, 17, 41, tzinfo=timezone.utc))

    def test_rejects_rows_without_a_usable_creation_time(self):
        for row in ("1\tsha256:a\tlatest", "1\tsha256:a\tlatest\tyesterday", "1\tsha256:a\tlatest\t2026-10-25T17:40:00"):
            with self.subTest(row=row), self.assertRaises(retention.CommandError):
                self.listing(row)

    def test_clean_package_skips_deletion_when_the_listing_is_malformed(self):
        calls: list[tuple[str, ...]] = []

        def runner(command):
            calls.append(tuple(command))
            return "1\tsha256:a\t\tnot-a-date\n"

        self.assertFalse(retention.clean_package("owner", "pkg", PROTECTED, runner=runner, sleeper=lambda _s: None))
        self.assertFalse(any("DELETE" in command for command in calls))


if __name__ == "__main__":
    unittest.main()
