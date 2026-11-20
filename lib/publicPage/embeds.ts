import { isSafeLink } from "./links";

/**
 * Outside media a public page may use. Video is YouTube (always through the privacy-enhanced youtube-nocookie.com
 * player) or Vimeo (with do-not-track), and nothing else; maps are a link out, never an embed. Pure and client-safe.
 */

/** The only hosts a page's video frame may load: lib/telemetry/csp.ts widens frame-src to exactly these on /o/*. */
export const VIDEO_FRAME_ORIGINS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com"] as const;

export type VideoEmbed = { provider: "youtube" | "vimeo"; id: string; embedUrl: string; watchUrl: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^[0-9]{6,12}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function youtubeId(url: URL): string | null {
  if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0] ?? null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const match = /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname);
  return match?.[1] ?? null;
}

function vimeoId(url: URL): string | null {
  const match = url.hostname === "player.vimeo.com" ? /^\/video\/([0-9]+)/.exec(url.pathname) : /^\/([0-9]+)(?:\/|$)/.exec(url.pathname);
  return match?.[1] ?? null;
}

/** A YouTube or Vimeo address as an embeddable player, or null for anything else. Only https addresses count. */
export function videoEmbed(value: string): VideoEmbed | null {
  if (!value || !isSafeLink(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeId(url);
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return { provider: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, watchUrl: `https://www.youtube.com/watch?v=${id}` };
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoId(url);
    if (!id || !VIMEO_ID.test(id)) return null;
    return { provider: "vimeo", id, embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`, watchUrl: `https://vimeo.com/${id}` };
  }
  return null;
}

const MAP_HOSTS = [/^(www\.)?google\.[a-z.]{2,6}$/, /^maps\.google\.[a-z.]{2,6}$/, /^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^(www\.)?openstreetmap\.org$/, /^maps\.apple\.com$/, /^(www\.)?bing\.com$/];

/** A link out to a maps service (Google Maps, OpenStreetMap, Apple Maps or Bing Maps) over https. */
export function isMapLink(value: string): boolean {
  if (!isSafeLink(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (!MAP_HOSTS.some((pattern) => pattern.test(host))) return false;
    // google.* and bing.com host much more than maps: only their map paths count.
    if (/google\./.test(host) && !host.startsWith("maps.") && !url.pathname.startsWith("/maps")) return false;
    if (host === "goo.gl" && !url.pathname.startsWith("/maps")) return false;
    if (/bing\.com$/.test(host) && !url.pathname.startsWith("/maps")) return false;
    return true;
  } catch {
    return false;
  }
}
