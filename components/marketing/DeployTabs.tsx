"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check } from "lucide-react";
import { CopyCommand } from "./CopyCommand";

const IMAGE = "ghcr.io/spaceworks-labs/spaceworks-organization";
const INSTALL = "curl -fsSL https://raw.githubusercontent.com/SpaceWorks-Labs/SpaceWorks-Organization/main/install.sh | bash";

/** The ways to run it, each with what it sets up and the command that starts it. */
const OPTIONS = [
  {
    id: "vps",
    label: "One VPS",
    summary: "Everything on one Linux server you own.",
    points: [
      "The installer asks every question first and changes nothing until you confirm.",
      "PostgreSQL 16, Redis, Silo file storage and automatic HTTPS, all in Docker.",
      "Nightly encrypted backups, kept on the server and offsite if you add a bucket.",
      "Updates come from GitHub releases; a backup is taken first and the old version returns if the new one fails its health check.",
    ],
    copy: INSTALL,
    terminal: [
      ["$ ", "curl -fsSL \\"],
      ["", "  https://raw.githubusercontent.com/\\"],
      ["", "SpaceWorks-Labs/SpaceWorks-Organization/\\"],
      ["", "main/install.sh | bash"],
      ["", ""],
      ["# ", "Deployment summary"],
      ["", "  Mode:        bundled (one server)"],
      ["", "  Database:    PostgreSQL 16"],
      ["", "  Storage:     Silo (S3)"],
      ["", "  HTTPS:       automatic"],
      ["", "  Backups:     nightly, encrypted"],
    ],
  },
  {
    id: "split",
    label: "Netlify + VPS",
    summary: "Public pages on Netlify, data and payments on your server.",
    points: [
      "Pages and dashboards render on Netlify's edge; no database or payment secret is ever set there.",
      "Your VPS runs the API, database, storage, email and payment webhooks.",
      "The two talk over a fixed allowlist signed with a shared secret.",
      "Set the package directory to frontend; the build settings ship in the repository.",
    ],
    copy: "npm run build:frontend",
    terminal: [
      ["# ", "On the VPS"],
      ["$ ", "DEPLOYMENT_MODE=backend ./install.sh"],
      ["", ""],
      ["# ", "On Netlify (package directory: frontend)"],
      ["$ ", "npm run build:frontend"],
      ["", ""],
      ["", "  BACKEND_ORIGIN       https://api.your-org.in"],
      ["", "  NEXT_PUBLIC_BASE_URL https://members.your-org.in"],
    ],
  },
  {
    id: "cloud",
    label: "Cloud free tier",
    summary: "No server to look after: managed services for each part.",
    points: [
      "Point it at managed Postgres, a hosted Redis, any S3-compatible storage and an email service.",
      "The same app image runs on any container host.",
      "Secrets stay in your host's settings, never in the repository.",
      "Move to a VPS later with a backup and restore.",
    ],
    copy: "./spaceworks-compose.sh cloud up -d",
    terminal: [
      ["$ ", "./spaceworks-compose.sh cloud up -d"],
      ["", ""],
      ["# ", "Deployment summary"],
      ["", "  Mode:        cloud"],
      ["", "  Database:    managed PostgreSQL"],
      ["", "  Cache:       hosted Redis"],
      ["", "  Storage:     S3-compatible bucket"],
      ["", "  Email:       SMTP service"],
    ],
  },
  {
    id: "docker",
    label: "Docker images",
    summary: "Released images for your own orchestration.",
    points: [
      `Every release publishes ${IMAGE} with a version tag and latest.`,
      "Migrations run on start, before the app takes traffic.",
      "Health and readiness endpoints for your load balancer.",
      "Roll back by pinning the previous version tag.",
    ],
    copy: `docker pull ${IMAGE}:latest`,
    terminal: [
      ["$ ", `docker pull ${IMAGE}:latest`],
      ["$ ", "docker compose up -d"],
      ["", ""],
      ["# ", "Services"],
      ["", "  app        :3000  /api/health"],
      ["", "  postgres   16"],
      ["", "  redis      7"],
      ["", "  silo       S3 storage"],
    ],
  },
] as const;

/** The self-hosting choices on the teal band, each with its terminal. */
export function DeployTabs() {
  return (
    <TabsPrimitive.Root defaultValue="vps" className="flex flex-col gap-6">
      <TabsPrimitive.List aria-label="Ways to run it" className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <TabsPrimitive.Trigger
            key={option.id}
            value={option.id}
            className="min-h-10 rounded-control border border-sw-cream/25 px-4 text-label font-semibold text-sw-cream transition-colors hover:bg-sw-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sw-citron data-[state=active]:border-sw-citron data-[state=active]:bg-sw-citron data-[state=active]:text-sw-ink"
          >
            {option.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      {OPTIONS.map((option) => (
        <TabsPrimitive.Content key={option.id} value={option.id} className="grid gap-8 focus-visible:outline-none lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
          <div className="flex flex-col gap-4">
            <p className="text-h4 text-sw-cream">{option.summary}</p>
            <ul className="flex flex-col gap-3">
              {option.points.map((point) => (
                <li key={point} className="flex gap-3 text-body-ui text-sw-cream/85">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sw-citron text-sw-ink">
                    <Check aria-hidden className="size-3.5" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <figure className="overflow-hidden rounded-[20px] bg-sw-ink text-sw-cream shadow-[0_30px_70px_-30px_rgb(0_0_0/0.6)]">
            <div className="flex items-center justify-between gap-3 border-b border-sw-cream/10 px-5 py-3">
              <figcaption className="text-caption text-sw-cream/70">Terminal preview · {option.label}</figcaption>
              <CopyCommand command={option.copy} />
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed text-sw-cream/90">
              <code>
                {option.terminal.map(([prompt, line], index) => (
                  <span key={index} className="block min-h-[1.6em]">
                    {prompt ? <span className={prompt === "$ " ? "text-sw-citron" : "text-sw-cream/50"}>{prompt}</span> : null}
                    <span className={prompt === "# " ? "text-sw-cream/60" : undefined}>{line}</span>
                  </span>
                ))}
                <span className="landing-caret mt-1 inline-block h-4 w-2 translate-y-0.5 bg-sw-citron" />
              </code>
            </pre>
          </figure>
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
