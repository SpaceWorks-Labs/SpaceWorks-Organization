import { Fragment } from "react";
import { CAPABILITY_LIST } from "@/lib/permissionRoles";

/** Permission names, settings keys, paths and link parameters in catalogue text, drawn as code (Outfit, tabular). */
const TOKENS = new RegExp(
  `(${[...CAPABILITY_LIST].sort((a, b) => b.length - a.length).map((name) => name.replace(".", "\\.")).join("|")}|PAYMENT_SECRETS_KEY|\\?unit=CODE|/o/<your-organisation>|/organisations|/account)`,
  "g",
);

/** One catalogue sentence, with its permission names and paths marked up as code. */
export function FeatureText({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKENS).map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="code-text whitespace-nowrap rounded-sm bg-surface px-1 py-px text-[0.9375em] text-ink [overflow-wrap:normal]">{part}</code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
