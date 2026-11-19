"use client";

import { useRef } from "react";
import { STORY } from "./storyData";
import { StoryRecord } from "./StoryRecord";
import { useActiveStep } from "./useInView";

const PINNED = "(min-width: 1024px) and (min-height: 640px)";

/**
 * How an organisation runs a membership, join → approve → pay → card → renew. The steps scroll past while the
 * sample record stays pinned beside them and moves to whichever step crosses the middle of the screen
 * (`aria-current="step"`). The record's button still works, and on wide screens it scrolls the matching step into
 * place. Below 1024px, or on a short screen, nothing is pinned: the steps read as a list and the record follows.
 */
export function MembershipStory() {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useActiveStep(list);
  const reach = (reached: number) => {
    const index = reached - 1;
    setActive(index);
    const node = list.current?.querySelector<HTMLElement>(`[data-step="${index}"]`);
    if (!node || !window.matchMedia?.(PINNED).matches) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  };
  return (
    <section id="how-it-works" aria-labelledby="story-title" className="sw-land-section">
      <div className="sw-land-wrap">
        <div className="sw-land-split" data-reveal="">
          <h2 id="story-title" className="sw-land-h2">
            Five steps. <span className="font-accent">One record.</span>
          </h2>
          <p className="sw-land-lede">
            Follow one sample membership from the join link to the renewal. Each step is written on the member’s record,
            so the committee never chases it by hand.
          </p>
        </div>
        <div className="sw-land-story">
          <ol ref={list} className="sw-land-steps">
            {STORY.map((step, index) => (
              <li key={step.key} data-step={index} aria-current={index === active ? "step" : undefined} className="sw-land-step">
                <span className="sw-land-step-index" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
                <p className="sw-land-step-state">{step.state}</p>
                <h3 className="sw-land-step-title">{step.title}</h3>
                <p className="sw-land-step-body">{step.body}</p>
              </li>
            ))}
          </ol>
          <div>
            <div className="sw-land-pin">
              <StoryRecord reached={active + 1} onReach={reach} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
