import { AdminRefresh } from "@/components/AdminRefresh";
import { AdminPagination } from "@/components/AdminPagination";
import { adminPage, adminQuery } from "@/lib/admin-navigation";
import { adminJobPresentation, supportedAdminJob } from "@/lib/admin-job-presentation";
import type { Metadata } from "next";
import Link from "next/link";
import { retryFailedJobAction } from "@/lib/admin-operations-actions";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { Notice } from "@/components/Notice";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { RETENTION_COUNT_LABELS, RETENTION_STALE_MS } from "@/lib/data-retention-policy";

export const metadata: Metadata = { title: "Admin · Operations" };

type SearchParams = {
  view?: string;
  page?: string;
  jobId?: string;
  status?: "all" | "pending" | "running" | "completed" | "failed";
  task?: string;
  error?: string;
  retried?: string;
};

function timestamp(value: Date | null, displayPreferences: DisplayFormatPreferences): string {
  return value ? formatDateTime(value, displayPreferences) : "—";
}

function jobStatus(job: { completedAt: Date | null; failedAt: Date | null; lockedAt: Date | null }): string {
  if (job.failedAt) return "Failed";
  if (job.completedAt) return "Completed";
  if (job.lockedAt) return "Running";
  return "Pending";
}

function heartbeatStaleSeconds(): number {
  const parsed = Number(process.env.WORKER_HEARTBEAT_STALE_SECONDS ?? "90");
  return Number.isFinite(parsed) && parsed >= 30 && parsed <= 3600 ? parsed : 90;
}

export default async function AdminOperationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user, permissions } = await requirePlatformAdmin("operations.read");
  const displayPreferences = await displayPreferencesForUser(user.id);
  const params = await searchParams;
  const status = typeof params.status === "string" && ["all", "pending", "running", "completed", "failed"].includes(params.status) ? params.status : "failed";
  const view = params.view === "health" || params.view === "maintenance" ? params.view : "jobs";
  const task = typeof params.task === "string" ? params.task.trim().slice(0, 128) : "";
  const statusWhere = status === "failed"
    ? { failedAt: { not: null } }
    : status === "completed"
      ? { completedAt: { not: null } }
      : status === "running"
        ? { lockedAt: { not: null }, completedAt: null, failedAt: null }
        : status === "pending"
          ? { lockedAt: null, completedAt: null, failedAt: null }
          : {};

  const where = { ...statusWhere, ...(task ? { task: { contains: task, mode: "insensitive" as const } } : {}), ...(params.jobId ? { id: params.jobId.slice(0,100) } : {}) };
  const total = await prisma.job.count({ where });
  const page = Math.min(adminPage(params.page), Math.max(1, Math.ceil(total / 25)));
  const pageHref = (page: number) => adminQuery("/admin/operations", { view, status, task, jobId: params.jobId, page });
  const staleSeconds = heartbeatStaleSeconds();
  const staleCutoff = new Date(Date.now() - staleSeconds * 1000);
  const [jobs, taskRows, failedJobs, pendingJobs, runningJobs, healthyWorkerCount, staleWorkerCount, workers, retention] = await Promise.all([
    prisma.job.findMany({
      where,
      include: { workspace: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25, skip: (page - 1) * 25
    }),
    prisma.job.findMany({ distinct: ["task"], select: { task: true }, orderBy: { task: "asc" } }),
    prisma.job.count({ where: { failedAt: { not: null } } }),
    prisma.job.count({ where: { lockedAt: null, completedAt: null, failedAt: null } }),
    prisma.job.count({ where: { lockedAt: { not: null }, completedAt: null, failedAt: null } }),
    prisma.workerHeartbeat.count({ where: { status: "RUNNING", lastSeenAt: { gte: staleCutoff } } }),
    prisma.workerHeartbeat.count({ where: { status: "RUNNING", lastSeenAt: { lt: staleCutoff } } }),
    prisma.workerHeartbeat.findMany({ orderBy: { lastSeenAt: "desc" }, take: 20 }),
    prisma.dataRetentionState.findUnique({ where: { id: "primary" }, select: { completedAt: true, failedAt: true, counts: true } })
  ]);
  const retentionStale = !retention?.completedAt || !!retention.failedAt || Date.now() - retention.completedAt.getTime() > RETENTION_STALE_MS;
  const retentionCounts = retention?.counts && typeof retention.counts === "object" && !Array.isArray(retention.counts) ? retention.counts : {};

  return (
    <div className="page admin-control-page">
      <header className="page-header">
        <div><h1>Admin · Operations</h1><p>Inspect background work, worker health, and recoverable failures.</p></div><Link className="button" href="/admin/operations/alerts">Operational alerts</Link>
      </header>
      {params.error && <Notice type="error">{String(params.error).slice(0, 400)}</Notice>}{params.retried && <Notice>Job queued for another attempt.</Notice>}

      <AdminRefresh observedAt={new Date().toISOString()} />
      <nav className="admin-content-tabs" aria-label="Operations views">{[["jobs", "Failed work and jobs"], ["health", "Worker health"], ["maintenance", "Maintenance"]].map(([key, label]) => <Link key={key} href={adminQuery("/admin/operations", { view: key })} aria-current={view === key ? "page" : undefined}>{label}</Link>)}</nav>
      <section className="admin-metric-grid">
        <Link className={`card admin-metric-card ${failedJobs ? "critical" : "healthy"}`} href="/admin/operations?status=failed"><span>Failed jobs</span><strong>{failedJobs}</strong><small>Eligible failures can be retried safely.</small></Link>
        <Link className="card admin-metric-card" href="/admin/operations?status=pending"><span>Pending jobs</span><strong>{pendingJobs}</strong><small>Waiting for a worker lease.</small></Link>
        <Link className="card admin-metric-card" href="/admin/operations?status=running"><span>Running jobs</span><strong>{runningJobs}</strong><small>Currently locked by a worker.</small></Link>
        <div className={`card admin-metric-card ${healthyWorkerCount ? "healthy" : "critical"}`}><span>Healthy workers</span><strong>{healthyWorkerCount}</strong><small>Heartbeat received within {staleSeconds} seconds.</small></div>
        <div className={`card admin-metric-card ${staleWorkerCount ? "critical" : "healthy"}`}><span>Stale workers</span><strong>{staleWorkerCount}</strong><small>Running records missing a current heartbeat.</small></div>
      </section>

      {view === "maintenance" && <section className="card form-stack" id="data-retention">
        <h2>Data retention</h2>
        {retentionStale ? <Notice type="error">Data cleanup is missing, stale, or failed. Check the worker before relying on the retention schedule.</Notice> : <Notice type="success">A complete data cleanup pass was recorded within the last 24 hours.</Notice>}
        <p>Last complete pass: {timestamp(retention?.completedAt ?? null, displayPreferences)}. Each pass processes a bounded batch; older records can remain while a backlog clears.</p>
        {retention?.counts && <dl>{Object.entries(RETENTION_COUNT_LABELS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{typeof retentionCounts[key] === "number" && Number.isSafeInteger(retentionCounts[key]) && Number(retentionCounts[key]) >= 0 ? String(retentionCounts[key]) : "—"}</dd></div>)}</dl>}
        <p>Active invitations, open support cases, pending support email, opt-outs and lifetime invitation slots are protected. Minimal email keys and event IDs remain to prevent reuse and replay.</p>
      </section>}

      {view === "health" && <section className="card admin-operation-section">
        <div className="card-header"><div><h2>Worker heartbeats</h2><p>Showing the 20 most recent worker records. Stale heartbeats can delay customer follow-ups, imports and email.</p></div></div>
        <div className="admin-operation-list">
          {workers.map((worker) => {
            const ageSeconds = Math.max(0, Math.floor((Date.now() - worker.lastSeenAt.getTime()) / 1000));
            const healthy = worker.status === "RUNNING" && ageSeconds <= staleSeconds;
            return (
              <article className="admin-operation-row" key={worker.id}>
                <div><strong>{worker.workerId}</strong><span>{worker.status} · {healthy ? "Healthy" : worker.status === "RUNNING" ? "Stale" : "Stopped"}</span><small>Started {timestamp(worker.startedAt, displayPreferences)} · last seen {timestamp(worker.lastSeenAt, displayPreferences)} ({ageSeconds}s ago) · last job {timestamp(worker.lastJobAt, displayPreferences)}</small></div>
                <span className={`status-pill ${healthy ? "done" : ""}`}>{healthy ? "Ready" : "Attention"}</span>
              </article>
            );
          })}
          {!workers.length && <div className="empty-state compact"><h3>No worker heartbeat recorded</h3><p>Start the worker service after applying the database migrations.</p></div>}
        </div>
      </section>}

      {view === "jobs" && <section className="card admin-operation-section">
        <div className="card-header"><div><h2>Background jobs</h2><p>Filter recent work and retry only records that reached a failed state.</p></div></div>
        <form className="filter-bar admin-operation-filters" method="get">
          <input type="hidden" name="view" value="jobs" />{params.jobId && <input name="jobId" type="hidden" value={params.jobId} />}
          <select name="status" defaultValue={status} aria-label="Filter jobs by status"><option value="failed">Failed</option><option value="pending">Pending</option><option value="running">Running</option><option value="completed">Completed</option><option value="all">All</option></select>
          <select name="task" defaultValue={task} aria-label="Filter jobs by task"><option value="">All tasks</option>{taskRows.map((row) => <option key={row.task} value={row.task}>{adminJobPresentation(row.task).title}</option>)}</select>
          <button className="button" type="submit">Filter</button>
          {(status !== "failed" || task) && <Link className="button" href="/admin/operations">Reset</Link>}
        </form>
        <div className="admin-operation-list">
          {jobs.map((job) => (
            <article className="admin-operation-row" key={job.id}>
              <div><strong>{adminJobPresentation(job.task).title}</strong><span>{job.workspace?.name ?? "Platform job"} · {jobStatus(job)}</span><p>{job.completedAt ? "Work completed." : adminJobPresentation(job.task).impact}</p>{job.failedAt && <small>{adminJobPresentation(job.task).next}</small>}<details><summary>Diagnostics and dates</summary><p>Task: {job.task} · Record {job.id}</p><small>Created {timestamp(job.createdAt, displayPreferences)} · run at {timestamp(job.runAt, displayPreferences)} · attempts {job.attempts}/{job.maxAttempts}</small>{job.lastError && <code>{job.lastError}</code>}</details></div>
              {supportedAdminJob(job.task) && job.failedAt && !job.completedAt && !job.lockedAt && permissions.includes("jobs.retry") && <form action={retryFailedJobAction}><input type="hidden" name="returnTo" value={pageHref(page)} /><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="failedAt" value={job.failedAt.toISOString()} /><FormSubmitButton label="Retry" pendingLabel="Retrying…" /></form>}
            </article>
          ))}
          {!jobs.length && <div className="empty-state compact"><h3>No jobs matched</h3><p>Try a different status or task filter.</p></div>}
        </div>
        <AdminPagination page={page} total={total} pageSize={25} href={pageHref} />
      </section>}
    </div>
  );
}
