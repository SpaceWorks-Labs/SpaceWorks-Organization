import type { OrganisationReviewAction } from "@prisma/client";
import { REVIEW_ACTION_LABELS } from "@/lib/organisationLifecycle";

type ReviewRow = {
  id: string;
  action: OrganisationReviewAction;
  reason: string | null;
  createdAt: Date;
  actor?: { name: string | null; email: string | null } | null;
};

/** An organisation's lifecycle timeline: the decision, who made it, when and why. */
export function ReviewHistory({ reviews, showActor = true }: { reviews: ReviewRow[]; showActor?: boolean }) {
  if (reviews.length === 0) return <p className="text-body-ui text-ink-muted">Nothing yet.</p>;
  return (
    <ol className="flex flex-col gap-4">
      {reviews.map((review) => (
        <li key={review.id} className="flex flex-col gap-0.5 border-l-2 border-line pl-4">
          <span className="text-label font-semibold text-ink">{REVIEW_ACTION_LABELS[review.action]}</span>
          <span className="text-caption text-ink-muted">
            {review.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            {showActor && review.actor ? ` · ${review.actor.name ?? review.actor.email}` : ""}
          </span>
          {review.reason ? <p className="mt-1 whitespace-pre-wrap text-body-ui text-ink-secondary">{review.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
