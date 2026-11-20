/**
 * Public links for the Space Works Organization open-source project, shared by the site header, footer, landing
 * page, /features and /about (product rules §12.1: repository, latest release and install, docs, licence and
 * changelog in the header and the footer).
 */
const GITHUB_REPO = "SpaceWorks-Labs/SpaceWorks-Organization";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const LICENSE_SPDX = "AGPL-3.0-or-later";
export const CHANGELOG_URL = `${GITHUB_URL}/blob/main/CHANGELOG.md`;
/** Each build is tagged v<series>-main.<run>.<sha> (CHANGELOG.md), so the stable link is the latest release. */
export const RELEASE_URL = `${GITHUB_URL}/releases/latest`;

/**
 * The release series this build belongs to, kept equal to the root VERSION file by
 * tests/unit/open-source-links.test.ts. The split frontend build copies only app/, components/, lib/ and public/
 * (scripts/prepare-frontend.mjs), so VERSION itself is not readable there: bump this with VERSION.
 */
export const RELEASE_VERSION = "0.10.0";

/** The one-line installer for a single Linux server (docs/DEPLOYMENT_VPS.md). */
export const INSTALL_COMMAND = `curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh | bash`;

/** The in-product docs viewer (/docs) and one feature area's page in it. */
export const DOCS_PATH = "/docs";
export function docsPath(slug: string) {
  return `${DOCS_PATH}/${slug}`;
}
