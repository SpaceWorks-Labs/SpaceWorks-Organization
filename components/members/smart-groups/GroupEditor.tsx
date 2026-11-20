"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Dropdown, Field } from "@/components/ui/field";
import { newGroup, newRule, type GroupMode, type UiGroup, type UiNode } from "@/lib/groups/builderModel";
import { RuleEditor, type BuilderOptions } from "./RuleEditor";

const MODES: Array<[GroupMode, string]> = [["all", "All of these"], ["any", "Any of these"], ["none", "None of these"]];

/** A group of conditions (and nested groups), joined by "all", "any" or "none". */
export function GroupEditor({ group, options, depth = 0, onChange, onRemove }: { group: UiGroup; options: BuilderOptions; depth?: number; onChange: (group: UiGroup) => void; onRemove?: () => void }) {
  const setItem = (index: number, item: UiNode) => onChange({ ...group, items: group.items.map((entry, i) => (i === index ? item : entry)) });
  const remove = (index: number) => onChange({ ...group, items: group.items.filter((_, i) => i !== index) });
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:p-4">
      <div className="flex items-end gap-3">
        <Field label="Members match" className="w-full max-w-48">
          <Dropdown value={group.mode} onChange={(event) => onChange({ ...group, mode: event.target.value as GroupMode })}>
            {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Dropdown>
        </Field>
        {onRemove ? <IconButton label="Remove this group" size="sm" variant="danger" className="mb-1 ml-auto" onClick={onRemove}><Trash2 aria-hidden className="size-4" /></IconButton> : null}
      </div>
      <ul className="flex flex-col gap-3">
        {group.items.map((item, index) => (
          <li key={item.id} className="flex flex-col gap-2">
            {item.kind === "group"
              ? <GroupEditor group={item} options={options} depth={depth + 1} onChange={(next) => setItem(index, next)} onRemove={() => remove(index)} />
              : (
                <div className="flex items-start gap-2 rounded-xl border border-line bg-panel p-3 sm:gap-3">
                  <div className="min-w-0 flex-1"><RuleEditor rule={item.rule} options={options} onChange={(rule) => setItem(index, { ...item, rule })} /></div>
                  <IconButton label="Remove this condition" size="sm" variant="danger" onClick={() => remove(index)}><Trash2 aria-hidden className="size-4" /></IconButton>
                </div>
              )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ ...group, items: [...group.items, newRule()] })}><Plus aria-hidden className="size-4" />Add a condition</Button>
        {depth < 3 ? <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...group, items: [...group.items, newGroup("any", [newRule()])] })}>Add a group</Button> : null}
      </div>
    </div>
  );
}
