import { AlertTriangle, CircleCheck, CircleHelp, OctagonAlert } from "lucide-react";
import type { SuperAdminOperationsHealthView } from "@/lib/views/app__super-admin__analytics__health";
import { BarList } from "@/components/reports/charts/BarList";
import { ChartFrame } from "@/components/reports/charts/ChartFrame";
import { Chip, type ChipTone } from "@/components/ui/display";
import { bytes, count, duration, humanise, relativeTime } from "./format";
import { Empty, StatList } from "./parts";

type View = SuperAdminOperationsHealthView;
type Job = View["jobs"][number];

const STATUS: Record<Job["status"], { word: string; tone: ChipTone; Icon: typeof CircleCheck; meaning: string }> = {
  fresh: { word: "Running", tone: "success", Icon: CircleCheck, meaning: "Succeeded inside its expected window" },
  stale: { word: "Late", tone: "warning", Icon: AlertTriangle, meaning: "Last succeeded longer ago than expected" },
  never: { word: "Never run", tone: "danger", Icon: OctagonAlert, meaning: "No successful run recorded" },
  unknown: { word: "No schedule", tone: "neutral", Icon: CircleHelp, meaning: "Age only: this job has no expected window" },
};

function JobRow({ job, now }: { job: Job; now: View["now"] }) {
  const status = STATUS[job.status];
  return (
    <li className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-body-ui font-semibold text-ink">{job.label}</p>
        <p className="text-caption text-ink-muted">
          {job.lastSucceededAt ? `Last succeeded ${relativeTime(job.lastSucceededAt, now)}` : "No success recorded"}
          {job.staleAfterSeconds ? ` · expected every ${duration(job.staleAfterSeconds)}` : ""}
          {job.lastSent || job.lastFailed ? ` · last run ${count(job.lastSent)} sent, ${count(job.lastFailed)} failed` : ""}
          {job.hasError ? " · last run reported an error" : ""}
        </p>
      </div>
      <span className="shrink-0" title={status.meaning}>
        <Chip size="sm" tone={status.tone} icon={<status.Icon />}>{status.word}</Chip>
        <span className="sr-only">: {status.meaning}</span>
      </span>
    </li>
  );
}

/** Background job heartbeats (status as a word and an icon, never colour alone) and stored file sizes. */
export function OperationsSystem({ view }: { view: View }) {
  const { jobs, storage } = view;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartFrame title="Background jobs" description="From each job's heartbeat. Error text is never shown here; see Monitoring.">
        {jobs.length ? (
          <ul aria-label="Background jobs">
            {jobs.map((job) => <JobRow key={job.key} job={job} now={view.now} />)}
          </ul>
        ) : (
          <Empty>No job has reported a heartbeat yet.</Empty>
        )}
        {jobs.length ? (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted" aria-label="What the statuses mean">
            {Object.values(STATUS).map((status) => <li key={status.word}><span className="font-semibold text-ink-secondary">{status.word}</span>: {status.meaning.toLowerCase()}</li>)}
          </ul>
        ) : null}
      </ChartFrame>
      <ChartFrame title="Storage used" description="Files recorded in the asset table, by provider. Files stored outside it are not counted.">
        <div className="flex flex-col gap-4">
          <StatList label="Storage totals" items={[{ label: "Stored", value: bytes(storage.bytes) }, { label: "Files", value: count(storage.objects) }]} />
          {storage.byProvider.length > 1 ? (
            <BarList label="Storage by provider" items={storage.byProvider.map((p) => ({ key: p.provider, label: humanise(p.provider), value: p.bytes, display: `${bytes(p.bytes)} · ${count(p.objects)} files` }))} />
          ) : storage.byProvider.length === 1 ? (
            <p className="text-label text-ink-muted">All on {humanise(storage.byProvider[0].provider)}.</p>
          ) : null}
        </div>
      </ChartFrame>
    </div>
  );
}
