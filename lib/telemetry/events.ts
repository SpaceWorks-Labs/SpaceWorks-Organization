/**
 * The shared analytics event names (product rules §8.4). Every product and client sends the same names, with route
 * templates, enums, counts or booleans only. A new event is added to the design system's list before any product
 * sends it, then here.
 *
 * `page_view` { route, client } — a permitted route is shown. Providers' own automatic page events stay off; GA4,
 * Firebase, PostHog and Mixpanel receive `page_view` itself. Plausible and Umami count page views only through their
 * built-in page-view call, so that call is the transport and carries the same `route` and `client` properties.
 */
export const TELEMETRY_EVENTS = ["page_view"] as const;
export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];
