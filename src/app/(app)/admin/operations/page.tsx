import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { retryFailedJobAction } from "@/lib/admin-operations-actions";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Operations" };

type SearchParams = {
  status?: "all" | "pending" | "running" | "completed" | "failed";
  task?: string;
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
  const { user } = await requirePlatformAdmin();
  const displayPreferences = await displayPreferencesForUser(user.id);
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

  const staleSeconds = heartbeatStaleSeconds();
  const staleCutoff = new Date(Date.now() - staleSeconds * 1000);
  const [jobs, taskRows, failedJobs, pendingJobs, runningJobs, healthyWorkerCount, staleWorkerCount, workers] = await Promise.all([
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
    prisma.workerHeartbeat.count({ where: { status: "RUNNING", lastSeenAt: { gte: staleCutoff } } }),
    prisma.workerHeartbeat.count({ where: { status: "RUNNING", lastSeenAt: { lt: staleCutoff } } }),
    prisma.workerHeartbeat.findMany({ orderBy: { lastSeenAt: "desc" }, take: 20 })
  ]);

  return (
    <div className="page admin-control-page">
      <header className="page-header">
        <div><h1>Admin · Operations</h1><p>Inspect background work, worker health, and recoverable failures.</p></div>
      </header>
      <AdminNav current="/admin/operations" />

      <section className="admin-metric-grid">
        <Link className={`card admin-metric-card ${failedJobs ? "critical" : "healthy"}`} href="/admin/operations?status=failed"><span>Failed jobs</span><strong>{failedJobs}</strong><small>Eligible failures can be retried safely.</small></Link>
        <Link className="card admin-metric-card" href="/admin/operations?status=pending"><span>Pending jobs</span><strong>{pendingJobs}</strong><small>Waiting for a worker lease.</small></Link>
        <Link className="card admin-metric-card" href="/admin/operations?status=running"><span>Running jobs</span><strong>{runningJobs}</strong><small>Currently locked by a worker.</small></Link>
        <div className={`card admin-metric-card ${healthyWorkerCount ? "healthy" : "critical"}`}><span>Healthy workers</span><strong>{healthyWorkerCount}</strong><small>Heartbeat received within {staleSeconds} seconds.</small></div>
        <div className={`card admin-metric-card ${staleWorkerCount ? "critical" : "healthy"}`}><span>Stale workers</span><strong>{staleWorkerCount}</strong><small>Running records missing a current heartbeat.</small></div>
      </section>

      <section className="card admin-operation-section">
        <div className="card-header"><div><h2>Worker heartbeats</h2><p>Each running worker records a durable heartbeat for health checks and release qualification.</p></div></div>
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
              <div><strong>{job.task}</strong><span>{job.workspace?.name ?? "Platform job"} · {jobStatus(job)}</span><small>Created {timestamp(job.createdAt, displayPreferences)} · run at {timestamp(job.runAt, displayPreferences)} · attempts {job.attempts}/{job.maxAttempts}</small>{job.lastError && <code>{job.lastError}</code>}</div>
              {job.failedAt && <form action={retryFailedJobAction}><input type="hidden" name="jobId" value={job.id} /><button className="button small primary" type="submit">Retry</button></form>}
            </article>
          ))}
          {!jobs.length && <div className="empty-state compact"><h3>No jobs matched</h3><p>Try a different status or task filter.</p></div>}
        </div>
      </section>
    </div>
  );
}
