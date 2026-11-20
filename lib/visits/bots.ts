/** Obvious automation by user agent. A missing or oversized one counts as a bot; this is a filter, not a security boundary. */
const BOT = /bot\b|bot[/;_ -]|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|monitor|uptime|pingdom|curl\/|wget|python-requests|httpclient|go-http|okhttp|java\/|axios|node-fetch|undici|scrapy|phantom|puppeteer|playwright|selenium/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || userAgent.length > 500 || BOT.test(userAgent);
}
