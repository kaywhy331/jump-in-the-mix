import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { updateJumpStatusAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { JumpStatus, Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Jumps" };

type Snapshot = { subject?: string; body?: string; script?: string };

function actionUrl(channel: string, email: string | undefined, phone: string | undefined, snapshot: Snapshot): string | null {
  const body = encodeURIComponent(snapshot.body ?? "");
  if (channel === "EMAIL" && email) return `mailto:${email}?subject=${encodeURIComponent(snapshot.subject ?? "")}&body=${body}`;
  if (channel === "SMS" && phone) return `sms:${phone}?body=${body}`;
  if (channel === "WHATSAPP" && phone) return `https://wa.me/${phone.replace(/\D/g, "")}?text=${body}`;
  if ((channel === "PHONE_CALL" || channel === "VOICEMAIL") && phone) return `tel:${phone}`;
  return null;
}

export default async function JumpsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "today" } = await searchParams;
  const { workspace } = await requireWorkspace();
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);

  const pendingStatuses: JumpStatus[] = ["PENDING", "COPIED"];
  const completedStatuses: JumpStatus[] = ["DONE", "SENT", "SKIPPED"];
  const where: Prisma.JumpWhereInput = view === "upcoming"
    ? { scheduledAt: { gte: end }, status: { in: pendingStatuses } }
    : view === "past"
      ? { scheduledAt: { lt: start }, status: { in: pendingStatuses } }
      : view === "completed"
        ? { status: { in: completedStatuses } }
        : { scheduledAt: { gte: start, lt: end }, status: { in: pendingStatuses } };

  const jumps = await prisma.jump.findMany({
    where: { workspaceId: workspace.id, ...where },
    include: { contact: { include: { emails: true, phones: true } }, mix: true, stepVersion: { include: { stepTemplate: true } } },
    orderBy: { scheduledAt: view === "past" ? "desc" : "asc" },
    take: 100
  });

  return (
    <div className="page">
      <header className="page-header"><div><h1>Jumps</h1><p>Who needs attention, why it matters, and the next action to take.</p></div></header>
      <div className="filter-bar">
        {[["today", "Today"], ["upcoming", "Upcoming"], ["past", "Past"], ["completed", "Completed"]].map(([key, label]) => <a key={key} className={view === key ? "button primary" : "button"} href={`/jumps?view=${key}`}>{label}</a>)}
      </div>
      {jumps.length ? (
        <div className="jump-list">
          {jumps.map((jump) => {
            const snapshot = (jump.renderedSnapshot ?? {}) as Snapshot;
            const email = jump.contact.emails.find((item) => item.isPrimary)?.email ?? jump.contact.emails[0]?.email;
            const phone = jump.contact.phones.find((item) => item.isPrimary)?.phone ?? jump.contact.phones[0]?.phone;
            const channel = jump.stepVersion.stepTemplate.channel;
            const url = actionUrl(channel, email, phone, snapshot);
            return (
              <article className="jump-card" key={jump.id}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><h3>{jump.contact.displayName}</h3><span className="channel-pill">{channel.replaceAll("_", " ")}</span><span className={`status-pill ${jump.status === "DONE" ? "done" : ""}`}>{jump.status.toLowerCase()}</span></div>
                  <div className="jump-meta"><span>{jump.reason}</span><span>{jump.mix.name}</span><span>{formatDateTime(jump.scheduledAt)}</span></div>
                  {(snapshot.body || snapshot.script) && <p style={{ color: "var(--muted)", margin: "9px 0 0", whiteSpace: "pre-wrap" }}>{snapshot.body ?? snapshot.script}</p>}
                </div>
                <div className="jump-actions">
                  {url && <a href={url} target={channel === "WHATSAPP" ? "_blank" : undefined} rel="noreferrer" className="button small primary">Open {channel === "PHONE_CALL" ? "call" : channel.toLowerCase().replace("_", " ")}</a>}
                  {!url && <span className="status-pill">Add {channel === "EMAIL" ? "email" : "phone"} first</span>}
                  {!(["DONE", "SENT", "SKIPPED"] as string[]).includes(jump.status) && <><form action={updateJumpStatusAction}><input type="hidden" name="jumpId" value={jump.id} /><input type="hidden" name="status" value="DONE" /><button className="button small" type="submit">Done</button></form><form action={updateJumpStatusAction}><input type="hidden" name="jumpId" value={jump.id} /><input type="hidden" name="status" value="SKIPPED" /><button className="button small" type="submit">Skip</button></form></>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title={`No ${view} Jumps`} description="Jumps appear after a contact has an Important Date and an active Mix assignment." actionHref="/contacts" actionLabel="Review contacts" />
      )}
    </div>
  );
}
