"use client";

import { DIVIDER_VARIANTS, EMPTY_ACTION, isSafeLink, MAX_BADGES, MAX_BUTTONS, MAX_ICON_ITEMS, MAX_PREVIEW_POINTS, SPACINGS, type PageAction } from "@/lib/publicPage/sections";
import { SwitchRow } from "@/components/ui/choice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ActionFields } from "./ActionFields";
import { IconPicker } from "./IconPicker";
import { IntroFields } from "./MembershipFields";
import { ChoiceCards, ItemList, type SectionProps } from "./shared";

const ALIGN_OPTIONS = [
  { value: "start", label: "Left", description: "In line with the text." },
  { value: "centre", label: "Centred", description: "In the middle of the page." },
] as const;

const UNSAFE_LINK = "Use a web address starting with https://, or mailto:";

/** A row of up to six buttons; the first is filled, the rest outlined. */
export function ButtonsFields({ section, plans, disabled, error, onChange }: SectionProps<"buttons">) {
  return (
    <div className="flex flex-col gap-4">
      <ChoiceCards label="Line up" value={section.align} options={ALIGN_OPTIONS} disabled={disabled} onChange={(align) => onChange({ ...section, align })} />
      <ItemList
        items={section.items}
        max={MAX_BUTTONS}
        noun="button"
        addLabel="Add a button"
        empty="No buttons yet."
        disabled={disabled}
        create={(): PageAction => ({ ...EMPTY_ACTION, kind: "link", label: "Find out more" })}
        onChange={(items) => onChange({ ...section, items })}
      >
        {(item, index, set) => (
          <ActionFields legend={index === 0 ? "Filled button" : "Outlined button"} value={item} plans={plans} disabled={disabled} error={(path) => error(`items.${index}.${path}`)} onChange={(next) => set(next)} />
        )}
      </ItemList>
    </div>
  );
}

const LAYOUTS = [
  { value: "grid", label: "Grid", description: "Side by side, wrapping on phones." },
  { value: "list", label: "List", description: "One under another." },
] as const;

/** Short points with an icon each. */
export function IconListFields({ section, disabled, error, onChange }: SectionProps<"iconList">) {
  return (
    <div className="flex flex-col gap-4">
      <ChoiceCards label="Layout" value={section.layout} options={LAYOUTS} disabled={disabled} onChange={(layout) => onChange({ ...section, layout })} />
      <ItemList
        items={section.items}
        max={MAX_ICON_ITEMS}
        noun="point"
        addLabel="Add a point"
        empty="No points yet. Add what makes you worth joining."
        disabled={disabled}
        create={() => ({ icon: "star", title: "", text: "" })}
        onChange={(items) => onChange({ ...section, items })}
      >
        {(item, index, set) => (
          <div className="flex flex-col gap-3">
            <IconPicker label="Icon" value={item.icon} disabled={disabled} error={error(`items.${index}.icon`)} onChange={(icon) => set({ icon: icon ?? "star" })} />
            <Field label="Title" error={error(`items.${index}.title`)}>
              <Input value={item.title} maxLength={80} disabled={disabled} onChange={(event) => set({ title: event.target.value })} />
            </Field>
            <Field label="Text" optional error={error(`items.${index}.text`)}>
              <Textarea value={item.text} rows={2} maxLength={300} disabled={disabled} onChange={(event) => set({ text: event.target.value })} />
            </Field>
          </div>
        )}
      </ItemList>
    </div>
  );
}

const VARIANT_LABELS: Record<(typeof DIVIDER_VARIANTS)[number], string> = { line: "Line", dashed: "Dashed line", dots: "Dots", wave: "Wave", space: "Space only" };
const SPACING_LABELS: Record<(typeof SPACINGS)[number], string> = { small: "Small", medium: "Medium", large: "Large" };

/** A line, dots, a wave or plain space between sections. */
export function DividerFields({ section, disabled, onChange }: SectionProps<"divider">) {
  return (
    <div className="flex flex-col gap-4">
      <ChoiceCards label="Style" value={section.variant} options={DIVIDER_VARIANTS.map((value) => ({ value, label: VARIANT_LABELS[value] }))} disabled={disabled} onChange={(variant) => onChange({ ...section, variant })} />
      <ChoiceCards label="Space around it" value={section.spacing} options={SPACINGS.map((value) => ({ value, label: SPACING_LABELS[value] }))} disabled={disabled} onChange={(spacing) => onChange({ ...section, spacing })} />
      <p className="text-caption text-ink-muted">Dividers are decoration only; screen readers skip them.</p>
    </div>
  );
}

/** Small labels such as affiliations or awards, each with an optional icon and link. */
export function BadgesFields({ section, disabled, error, onChange }: SectionProps<"badges">) {
  return (
    <div className="flex flex-col gap-4">
      <ChoiceCards label="Line up" value={section.align} options={ALIGN_OPTIONS} disabled={disabled} onChange={(align) => onChange({ ...section, align })} />
      <ItemList
        items={section.items}
        max={MAX_BADGES}
        noun="badge"
        addLabel="Add a badge"
        empty="No badges yet. Add an affiliation, an award or a registration."
        disabled={disabled}
        create={() => ({ label: "", icon: null, url: "" })}
        onChange={(items) => onChange({ ...section, items })}
      >
        {(item, index, set) => {
          const urlError = error(`items.${index}.url`) ?? (item.url && !isSafeLink(item.url) ? UNSAFE_LINK : undefined);
          return (
            <div className="flex flex-col gap-3">
              <Field label="Label" error={error(`items.${index}.label`)}>
                <Input value={item.label} maxLength={40} disabled={disabled} onChange={(event) => set({ label: event.target.value })} />
              </Field>
              <IconPicker label="Icon" allowNone value={item.icon} disabled={disabled} error={error(`items.${index}.icon`)} onChange={(icon) => set({ icon })} />
              <Field label="Link" optional helperText="Where the badge goes, like https:// or mailto:" error={urlError}>
                <Input type="url" inputMode="url" value={item.url} maxLength={500} placeholder="https://" disabled={disabled} onChange={(event) => set({ url: event.target.value.trim() })} />
              </Field>
            </div>
          );
        }}
      </ItemList>
    </div>
  );
}

/** What members get after joining: bullet points and, optionally, the sample card. */
export function MembersPreviewFields({ section, disabled, error, onChange }: SectionProps<"membersPreview">) {
  const setPoints = (points: string[]) => onChange({ ...section, points });
  return (
    <div className="flex flex-col gap-4">
      <IntroFields intro={section.intro} disabled={disabled} error={error} onIntro={(intro) => onChange({ ...section, intro })} note="A line above the points." />
      <SwitchRow
        label="Show the member card"
        description="Shows your card design with a fictional sample name, never a real member."
        checked={section.showCard}
        disabled={disabled}
        onCheckedChange={(showCard) => onChange({ ...section, showCard })}
      />
      <ItemList
        items={section.points}
        max={MAX_PREVIEW_POINTS}
        noun="point"
        addLabel="Add a point"
        empty="No points yet. Add what members get, like their card or receipts."
        disabled={disabled}
        create={() => ""}
        onChange={setPoints}
      >
        {(point, index) => (
          <Field label={`Point ${index + 1}`} hideLabel error={error(`points.${index}`)}>
            <Input value={point} maxLength={160} disabled={disabled} onChange={(event) => setPoints(section.points.map((one, i) => (i === index ? event.target.value : one)))} />
          </Field>
        )}
      </ItemList>
    </div>
  );
}
