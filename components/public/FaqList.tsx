"use client";

import { Disclosure } from "@/components/motion/Collapse";

/** A public page's questions, each a disclosure whose answer opens below it with the shared height collapse. */
export function FaqList({ items }: { items: Array<{ question: string; answer: string }> }) {
  return (
    <div className="flex max-w-[760px] flex-col divide-y divide-line rounded-xl border border-line bg-panel p-2">
      {items.map((item, index) => (
        <Disclosure key={index} summary={item.question} className="py-1" buttonClassName="text-label">
          <p className="whitespace-pre-wrap px-3 pb-3 pt-1 text-body-ui text-ink-secondary">{item.answer}</p>
        </Disclosure>
      ))}
    </div>
  );
}
