import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { retryFailedJobAction } from "@/lib/admin-operations-actions";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Operations" };

type SearchParams = {
  status?: "all" | "pending" | "running" | "completed" | "failed";
  task?: string;
};

function timestamp(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";
}

function jobStatus(job: { completedAt: Date | null; failedAt: Date | null; lockedAt: Date | null }): string {
  if (job.failedAt) return "Failed";
  if (job.completedAt) return "Completed";
  if (job.lockedAt) return "Running";
  return "Pending";
}

export default async function AdminOperationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const status = params.status ?? "failed";
  const task = params.task?.trim() ?? "";
  const statusWhere = status === "failed"
    ? { failedAt: { not: null } }
    : status === "completed"
      ? { completedAt: { not: null } }
      : status === "running"
        ? { lockedAt: { not: null }, completedAt: null, failedAt: null }
        : status === "pending"
          ? { lockedAt: null, completedAt: null, failedAt: null }
          : {};

  const [jobs, taskRows, failedJobs, pendingJobs, runningJobs, failedWebhooks, errorConnections, syncRuns, webhookEvents, integrations] = await Promise.all([
    prisma.job.findMany({
      where: { ...statusWhere, ...(task ? { task: { contains: task, mode: "insensitive" } } : {}) },
      include: { workspace: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.job.findMany({ distinct: ["task"], select: { task: true }, orderBy: { task: "asc" } }),
    prisma.job.count({ where: { failedAt: { not: null } } }),
    prisma.job.count({ where: { lockedAt: null, completedAt: null, failedAt: null } }),
    prisma.job.count({ where: { lockedAt: { not: null }, completedAt: null, failedAt: null } }),
    prisma.webhookEvent.count({ where: { status: "FAILED" } }),
    prisma.integrationConnection.count({ where: { status: "ERROR" } }),
    prisma.syncRun.findMany({
      include: { connection: { select: { provider: true } }, workspace: { select: { name: true } } },
      orderBy: { startedAt: "desc" },
      take: 20
    }),
    prisma.webhookEvent.findMany({
      include: { workspace: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.integrationConnection.findMany({
      where: { OR: [{ status: "ERROR" }, { lastError: { not: null } }] },
      include: { workspace: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30
    })
  ]);

  return (
    <div className="page admin-control-page">
      <header className="page-header">
        <div><h1>Admin · Operations</h1><p>Inspect background work, provider synchronization, webhook delivery, and recoverable failures.</p></div>
      </header>
      <AdminNav current="/admin/operations" />

      <section className="admin-metric-grid">
        <Link className={`card admin-metric-card ${failedJobs ? "critical" : "healthy"}`} href="/admin/operations?status=failed"><span>Failed jobs</span><strong>{failedJobs}</strong><small>Eligible failures can be retried safely.</small></Link>
        <Link className="card admin-metric-card" href="/admin/operations?status=pending"><span>Pending jobs</span><strong>{pendingJobs}</strong><small>Waiting for a worker lease.</small></Link>
        <Link className="card admin-metric-card" href="/admin/operations?status=running"><span>Running jobs</span><strong>{runningJobs}</strong><small>Currently locked by a worker.</small></Link>
        <div className={`card admin-metric-card ${failedWebhooks ? "critical" : "healthy"}`}><span>Failed webhooks</span><strong>{failedWebhooks}</strong><small>Inspect Stripe and provider delivery state below.</small></div>
        <div className={`card admin-metric-card ${errorConnections ? "critical" : "healthy"}`}><span>Integration errors</span><strong>{errorConnections}</strong><small>Connections requiring customer or operator action.</small></div>
      </section>

      <section className="card admin-operation-section">
        <div className="card-header"><div><h2>Background jobs</h2><p>Filter recent work and retry only records that reached a failed state.</p></div></div>
        <form className="filter-bar admin-operation-filters" method="get">
          <select name="status" defaultValue={status} aria-label="Filter jobs by status"><option value="failed">Failed</option><option value="pending">Pending</option><option value="running">Running</option><option value="completed">Completed</option><option value="all">All</option></select>
          <select name="task" defaultValue={task} aria-label="Filter jobs by task"><option value="">All tasks</option>{taskRows.map((row) => <option key={row.task}>{row.task}</option>)}</select>
          <button className="button" type="submit">Filter</button>
          {(status !== "failed" || task) && <Link className="button" href="/admin/operations">Reset</Link>}
        </form>
        <div className="admin-operation-list">
          {jobs.map((job) => (
            <article className="admin-operation-row" key={job.id}>
              <div><strong>{job.task}</strong><span>{job.workspace?.name ?? "Platform job"} · {jobStatus(job)}</span><small>Created {timestamp(job.createdAt)} · run at {timestamp(job.runAt)} · attempts {job.attempts}/{job.maxAttempts}</small>{job.lastError && <code>{job.lastError}</code>}</div>
              {job.failedAt && <form action={retryFailedJobAction}><input type="hidden" name="jobId" value={job.id} /><button className="button small primary" type="submit">Retry</button></form>}
            </article>
          ))}
          {!jobs.length && <div className="empty-state compact"><h3>No jobs matched</h3><p>Try a different status or task filter.</p></div>}
        </div>
      </section>

      <div className="admin-operation-columns">
        <section className="card admin-operation-section">
          <div className="card-header"><div><h2>Recent synchronization</h2><p>Google and other provider run outcomes.</p></div></div>
          <div className="admin-operation-list">{syncRuns.map((run) => <article className="admin-operation-row" key={run.id}><div><strong>{run.connection.provider.replaceAll("_", " ")}</strong><span>{run.workspace.name} · {run.mode} · {run.status}</span><small>{timestamp(run.startedAt)} · {run.createdCount} created · {run.updatedCount} updated · {run.skippedCount} skipped · {run.errorCount} failed</small>{run.errorSummary && <code>{run.errorSummary}</code>}</div></article>)}{!syncRuns.length && <p className="muted-copy">No synchronization runs have been recorded.</p>}</div>
        </section>

        <section className="card admin-operation-section">
          <div className="card-header"><div><h2>Provider connections needing attention</h2><p>Sanitized account-level connection diagnostics.</p></div></div>
          <div className="admin-operation-list">{integrations.map((connection) => <article className="admin-operation-row" key={connection.id}><div><strong>{connection.provider.replaceAll("_", " ")}</strong><span>{connection.workspace.name} · {connection.status}</span><small>Last sync {timestamp(connection.lastSyncAt)} · next {timestamp(connection.nextSyncAt)}</small>{connection.lastError && <code>{connection.lastError}</code>}</div></article>)}{!integrations.length && <p className="muted-copy">No provider connection currently reports an error.</p>}</div>
        </section>
      </div>

      <section className="card admin-operation-section">
        <div className="card-header"><div><h2>Recent webhook events</h2><p>Event identifiers and processing state; secret payloads are not displayed.</p></div></div>
        <div className="admin-operation-list">{webhookEvents.map((event) => <article className="admin-operation-row" key={event.id}><div><strong>{event.provider} · {event.status}</strong><span>{event.workspace?.name ?? "Unresolved workspace"} · {event.externalId}</span><small>Received {timestamp(event.createdAt)} · processed {timestamp(event.processedAt)}</small>{event.error && <code>{event.error}</code>}</div></article>)}{!webhookEvents.length && <p className="muted-copy">No webhook events have been received.</p>}</div>
      </section>
    </div>
  );
}
