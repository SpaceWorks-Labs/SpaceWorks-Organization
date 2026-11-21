import { ArrowUpRight } from "lucide-react";
import { isExternalLink, pageImageUrl, type ColumnItem as Item, type SectionOf } from "@/lib/publicPage/sections";
import { cn } from "@/lib/cn";
import { ActionLink, externalProps, type ActionContext } from "../shared";
import { BlockIcon, IconMark } from "./icon";

/*
 * Layout blocks: columns, a button group, an icon list, a divider and badges. Plain text only; links passed
 * isSafeLink when saved; images are the organisation's own page images.
 */

function ColumnItem({ item, context }: { item: Item; context: ActionContext }) {
  switch (item.type) {
    case "heading": return item.level === 2 ? <h3 className="text-h3 text-balance text-ink">{item.text}</h3> : <h4 className="text-h4 text-ink">{item.text}</h4>;
    case "text": return <p className="whitespace-pre-wrap text-body-l text-pretty text-ink-secondary">{item.body}</p>;
    case "button": return <div className="flex"><ActionLink action={item.action} context={context} variant="accent" /></div>;
    case "icon": return <div className="flex items-center gap-3 text-body-l text-ink"><IconMark id={item.icon} size="sm" /><span className="min-w-0 break-words">{item.label}</span></div>;
    case "image":
      // eslint-disable-next-line @next/next/no-img-element -- page images are served by the app's own upload route
      return <img src={pageImageUrl(item.imageKey)} alt={item.alt} width={800} height={600} loading="lazy" className="aspect-[4/3] h-auto w-full rounded-xl border border-line object-cover" />;
  }
}

const COLUMN_GRID: Record<number, string> = { 2: "@2xl:grid-cols-2", 3: "@3xl:grid-cols-3", 4: "@xl:grid-cols-2 @5xl:grid-cols-4" };

export function Columns({ section, context }: { section: SectionOf<"columns">; context: ActionContext }) {
  return (
    <div className={cn("grid grid-cols-1 gap-x-10 gap-y-12", COLUMN_GRID[section.columns.length])}>
      {section.columns.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-col gap-5">{column.items.map((item, at) => <ColumnItem key={at} item={item} context={context} />)}</div>
      ))}
    </div>
  );
}

/** A row of buttons: the first is the accent, the rest secondary; they wrap on phones. */
export function Buttons({ section, context }: { section: SectionOf<"buttons">; context: ActionContext }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", section.align === "centre" && "justify-center")}>
      {section.items.map((action, index) => <ActionLink key={index} action={action} context={context} variant={index === 0 ? "accent" : "secondary"} />)}
    </div>
  );
}

/** Short points with an icon each: a two- or three-up grid of tiles, or a single list with rules between. */
export function IconList({ section }: { section: SectionOf<"iconList"> }) {
  if (section.layout === "list") {
    return (
      <ul className="flex max-w-[820px] flex-col divide-y divide-line border-y border-line">
        {section.items.map((item, index) => (
          <li key={index} className="flex items-start gap-4 py-5">
            <IconMark id={item.icon} />
            <div className="flex min-w-0 flex-col gap-1 pt-1">
              <h3 className="text-h4 break-words text-ink">{item.title}</h3>
              {item.text ? <p className="whitespace-pre-wrap text-body-ui text-ink-secondary">{item.text}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
      {section.items.map((item, index) => (
        <li key={index} className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-6">
          <IconMark id={item.icon} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h3 className="text-h4 break-words text-ink">{item.title}</h3>
            {item.text ? <p className="whitespace-pre-wrap text-body-ui text-ink-secondary">{item.text}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const SPACE: Record<SectionOf<"divider">["spacing"], string> = { small: "py-1", medium: "py-6", large: "py-14" };

/** A repeating mark (wave or dots) drawn as an SVG pattern in the accent, so it tiles at any width without stretching. */
function PatternRule({ id, variant }: { id: string; variant: "wave" | "dots" }) {
  const patternId = `divider-${variant}-${id}`;
  return (
    <svg aria-hidden width="100%" height="12" className="block text-accent" focusable="false">
      <defs>
        <pattern id={patternId} width={variant === "wave" ? 28 : 16} height="12" patternUnits="userSpaceOnUse">
          {variant === "wave"
            ? <path d="M0 6 Q7 0 14 6 T28 6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            : <circle cx="8" cy="6" r="2.5" fill="currentColor" />}
        </pattern>
      </defs>
      <rect width="100%" height="12" fill={`url(#${patternId})`} />
    </svg>
  );
}

/** Space or a rule between sections; purely decorative. */
export function Divider({ section }: { section: SectionOf<"divider"> }) {
  const rule = {
    line: <div className="h-px bg-line-strong" />,
    dashed: <div className="border-t-2 border-dashed border-line-strong" />,
    dots: <PatternRule id={section.id} variant="dots" />,
    wave: <PatternRule id={section.id} variant="wave" />,
    space: null,
  }[section.variant];
  return <div aria-hidden className={SPACE[section.spacing]}>{rule}</div>;
}

/** Small labels such as affiliations or awards; a badge with a link is a 44px target. */
export function Badges({ section }: { section: SectionOf<"badges"> }) {
  const pill = "inline-flex max-w-full items-center gap-2 rounded-full border border-line-strong bg-panel px-4 text-body-ui font-medium text-ink";
  return (
    <ul className={cn("flex flex-wrap gap-2.5", section.align === "centre" && "justify-center")}>
      {section.items.map((item, index) => {
        const icon = item.icon ? <BlockIcon id={item.icon} className="size-4 text-accent-text" /> : null;
        const label = <span className="min-w-0 break-words">{item.label}</span>;
        if (!item.url) return <li key={index} className="max-w-full"><span className={cn(pill, "min-h-10 py-1.5")}>{icon}{label}</span></li>;
        const external = isExternalLink(item.url);
        return (
          <li key={index} className="max-w-full">
            <a className={cn(pill, "min-h-11 py-2 transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted")} href={item.url} {...externalProps(external)}>
              {icon}{label}
              {external ? <><ArrowUpRight aria-hidden className="size-4 shrink-0 text-ink-muted" /><span className="sr-only"> (opens in a new tab)</span></> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
