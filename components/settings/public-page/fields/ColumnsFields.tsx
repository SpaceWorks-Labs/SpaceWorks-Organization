"use client";

import { COLUMN_ITEM_TYPES, EMPTY_ACTION, MAX_COLUMN_ITEMS, type ColumnItem } from "@/lib/publicPage/sections";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { ActionFields } from "./ActionFields";
import { IconPicker } from "./IconPicker";
import { PageImagePicker } from "./PageImagePicker";
import { ChoiceCards, ItemList, type FieldContext, type SectionProps } from "./shared";

type Kind = ColumnItem["type"];

const KIND_LABELS: Record<Kind, string> = { heading: "Heading", text: "Text", button: "Button", icon: "Icon with a label", image: "Image" };
const COUNTS = [
  { value: "2", label: "2 columns" },
  { value: "3", label: "3 columns" },
  { value: "4", label: "4 columns" },
] as const;

/** A fresh item of a kind, the starting point when an item is added or changes kind. */
function newItem(kind: Kind): ColumnItem {
  switch (kind) {
    case "heading": return { type: "heading", text: "", level: 3 };
    case "text": return { type: "text", body: "" };
    case "button": return { type: "button", action: { ...EMPTY_ACTION, kind: "plans", label: "See membership plans" } };
    case "icon": return { type: "icon", icon: "star", label: "" };
    case "image": return { type: "image", imageKey: "", alt: "" };
  }
}

/** One item's fields, by kind. `error` reads paths inside the item ("text", "action.label"). */
function ItemFields({ item, slug, plans, disabled, error, extras, onChange }: Omit<FieldContext, "error"> & { item: ColumnItem; error: (path: string) => string | undefined; onChange: (next: ColumnItem) => void }) {
  switch (item.type) {
    case "heading":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
          <Field label="Heading" error={error("text")}>
            <Input value={item.text} maxLength={120} disabled={disabled} onChange={(event) => onChange({ ...item, text: event.target.value })} />
          </Field>
          <Field label="Size" error={error("level")}>
            <Dropdown value={String(item.level)} disabled={disabled} onChange={(event) => onChange({ ...item, level: event.target.value === "2" ? 2 : 3 })}>
              <option value="2">Large</option>
              <option value="3">Small</option>
            </Dropdown>
          </Field>
        </div>
      );
    case "text":
      return (
        <Field label="Text" error={error("body")}>
          <Textarea value={item.body} rows={3} maxLength={1200} disabled={disabled} onChange={(event) => onChange({ ...item, body: event.target.value })} />
        </Field>
      );
    case "button":
      return <ActionFields legend="Button" value={item.action} plans={plans} disabled={disabled} error={(path) => error(`action.${path}`)} onChange={(action) => onChange({ ...item, action })} />;
    case "icon":
      return (
        <div className="flex flex-col gap-3">
          <IconPicker label="Icon" value={item.icon} disabled={disabled} error={error("icon")} onChange={(icon) => onChange({ ...item, icon: icon ?? "star" })} />
          <Field label="Label" optional error={error("label")}>
            <Input value={item.label} maxLength={80} disabled={disabled} onChange={(event) => onChange({ ...item, label: event.target.value })} />
          </Field>
        </div>
      );
    case "image":
      return (
        <div className="flex flex-col gap-3">
          <PageImagePicker slug={slug} label="Image" value={item.imageKey || null} images={extras.pageImages} disabled={disabled} error={error("imageKey")} onChange={(key) => onChange({ ...item, imageKey: key ?? "" })} />
          {item.imageKey ? (
            <Field label="Describe the image" optional helperText="For people using screen readers. Leave it empty if the image is only decoration." error={error("alt")}>
              <Input value={item.alt} maxLength={160} disabled={disabled} onChange={(event) => onChange({ ...item, alt: event.target.value })} />
            </Field>
          ) : null}
        </div>
      );
  }
}

/**
 * Two to four columns, each a short stack of headings, text, buttons, icons and images. With fewer columns, the items
 * of the columns that go move to the end of the last one (when they fit).
 */
export function ColumnsFields({ section, error, onChange, ...context }: SectionProps<"columns">) {
  const { disabled } = context;
  const { columns } = section;
  const fits = (count: number) => columns.slice(count - 1).reduce((total, column) => total + column.items.length, 0) <= MAX_COLUMN_ITEMS;
  const setCount = (count: number) => {
    if (count === columns.length) return;
    if (count > columns.length) return onChange({ ...section, columns: [...columns, ...Array.from({ length: count - columns.length }, () => ({ items: [] }))] });
    if (!fits(count)) return;
    const kept = columns.slice(0, count - 1);
    const merged = columns.slice(count - 1).flatMap((column) => column.items);
    onChange({ ...section, columns: [...kept, { items: merged }] });
  };
  const setItems = (at: number, items: ColumnItem[]) => onChange({ ...section, columns: columns.map((one, i) => (i === at ? { items } : one)) });
  const tooMany = COUNTS.filter((option) => Number(option.value) < columns.length && !fits(Number(option.value)));

  return (
    <div className="flex flex-col gap-4">
      <ChoiceCards label="Columns" value={String(columns.length) as "2" | "3" | "4"} options={COUNTS} disabled={disabled} onChange={(value) => setCount(Number(value))} />
      <p className="text-caption text-ink-muted">
        {tooMany.length
          ? `To use fewer columns, remove some items first: the last column holds up to ${MAX_COLUMN_ITEMS}.`
          : "With fewer columns, the items of the columns you remove move to the end of the last one. On phones the columns stack."}
      </p>
      {error("columns") ? <p className="text-caption text-danger-fg">{error("columns")}</p> : null}
      {columns.map((column, at) => (
        <fieldset key={at} className="flex flex-col gap-3 rounded-xl border border-line p-4" disabled={disabled}>
          <legend className="px-1 text-label font-semibold text-ink">Column {at + 1}</legend>
          <ItemList
            items={column.items}
            max={MAX_COLUMN_ITEMS}
            noun="item"
            addLabel="Add a column item"
            empty="Empty. Add a heading, some text, a button, an icon or an image."
            disabled={disabled}
            create={() => newItem("text")}
            onChange={(items) => setItems(at, items)}
          >
            {(item, index) => {
              const path = (field: string) => error(`columns.${at}.items.${index}.${field}`);
              // Replace the whole item (ItemList's patches merge, which would keep a previous kind's fields).
              const replace = (next: ColumnItem) => setItems(at, column.items.map((one, i) => (i === index ? next : one)));
              return (
                <div className="flex flex-col gap-3">
                  <Field label="Kind">
                    <Dropdown value={item.type} disabled={disabled} onChange={(event) => replace(newItem(event.target.value as Kind))}>
                      {COLUMN_ITEM_TYPES.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
                    </Dropdown>
                  </Field>
                  <ItemFields {...context} item={item} error={path} onChange={replace} />
                </div>
              );
            }}
          </ItemList>
        </fieldset>
      ))}
    </div>
  );
}
