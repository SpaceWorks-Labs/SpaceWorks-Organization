"use client";

import { MAX_PEOPLE, MAX_TESTIMONIALS, MAX_TIMELINE } from "@/lib/publicPage/sections";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ImageField, ItemList, type SectionProps } from "./shared";

/** Committee or office bearers, typed in: name, title, an optional photo and link. */
export function CommitteeFields(props: SectionProps<"committee">) {
  const { section, slug, disabled, error, onChange } = props;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Introduction" optional error={error("intro")}>
        <Textarea value={section.intro} rows={2} maxLength={600} disabled={disabled} onChange={(event) => onChange({ ...section, intro: event.target.value })} />
      </Field>
      <p className="text-caption text-ink-muted">Ask each person before you add their name and photo to a public page.</p>
      <ItemList
        items={section.people}
        max={MAX_PEOPLE}
        noun="person"
        addLabel="Add a person"
        empty="No one yet."
        disabled={disabled}
        create={() => ({ name: "", role: "", photoKey: null, url: "" })}
        onChange={(people) => onChange({ ...section, people })}
      >
        {(person, index, set) => (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Name" error={error(`people.${index}.name`)}>
                <Input value={person.name} maxLength={80} disabled={disabled} onChange={(event) => set({ name: event.target.value })} />
              </Field>
              <Field label="Title" optional error={error(`people.${index}.role`)}>
                <Input value={person.role} maxLength={80} placeholder="Secretary" disabled={disabled} onChange={(event) => set({ role: event.target.value })} />
              </Field>
            </div>
            <Field label="Link" optional helperText="A profile or email, like https:// or mailto:" error={error(`people.${index}.url`)}>
              <Input type="url" inputMode="url" value={person.url} maxLength={500} disabled={disabled} onChange={(event) => set({ url: event.target.value.trim() })} />
            </Field>
            <ImageField slug={slug} label="Photo" imageKey={person.photoKey} aspect="aspect-square max-w-[160px]" disabled={disabled} error={error(`people.${index}.photoKey`)} onChange={(next) => set({ photoKey: next.imageKey })} />
          </div>
        )}
      </ItemList>
    </div>
  );
}

/** What members say. */
export function TestimonialsFields({ section, disabled, error, onChange }: SectionProps<"testimonials">) {
  return (
    <ItemList
      items={section.items}
      max={MAX_TESTIMONIALS}
      noun="quote"
      addLabel="Add a quote"
      empty="No quotes yet."
      disabled={disabled}
      create={() => ({ quote: "", name: "", role: "" })}
      onChange={(items) => onChange({ ...section, items })}
    >
      {(item, index, set) => (
        <div className="flex flex-col gap-3">
          <Field label="Quote" error={error(`items.${index}.quote`)}>
            <Textarea value={item.quote} rows={3} maxLength={500} disabled={disabled} onChange={(event) => set({ quote: event.target.value })} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Who said it" error={error(`items.${index}.name`)}>
              <Input value={item.name} maxLength={80} disabled={disabled} onChange={(event) => set({ name: event.target.value })} />
            </Field>
            <Field label="Their role" optional error={error(`items.${index}.role`)}>
              <Input value={item.role} maxLength={80} placeholder="Member since 2019" disabled={disabled} onChange={(event) => set({ role: event.target.value })} />
            </Field>
          </div>
        </div>
      )}
    </ItemList>
  );
}

/** Milestones by year or date, shown in the order you put them. */
export function TimelineFields({ section, disabled, error, onChange }: SectionProps<"timeline">) {
  return (
    <ItemList
      items={section.items}
      max={MAX_TIMELINE}
      noun="milestone"
      addLabel="Add a milestone"
      empty="No milestones yet."
      disabled={disabled}
      create={() => ({ date: "", title: "", body: "" })}
      onChange={(items) => onChange({ ...section, items })}
    >
      {(item, index, set) => (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
            <Field label="Year or date" error={error(`items.${index}.date`)}>
              <Input value={item.date} maxLength={40} placeholder="2016" disabled={disabled} onChange={(event) => set({ date: event.target.value })} />
            </Field>
            <Field label="What happened" error={error(`items.${index}.title`)}>
              <Input value={item.title} maxLength={120} disabled={disabled} onChange={(event) => set({ title: event.target.value })} />
            </Field>
          </div>
          <Field label="More detail" optional error={error(`items.${index}.body`)}>
            <Textarea value={item.body} rows={2} maxLength={600} disabled={disabled} onChange={(event) => set({ body: event.target.value })} />
          </Field>
        </div>
      )}
    </ItemList>
  );
}
