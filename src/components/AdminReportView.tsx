import type { ReportView } from "./AdminReportTabs";
import type { ReactNode, CSSProperties } from "react";
import type { ReportData } from "@/lib/admin-report-data";
import { reportRatio } from "@/lib/admin-report-range";
import { ReportTrend } from "./ReportTrend";
import styles from "./AdminReports.module.css";

const sourceNames: Record<string, string> = { REFERRAL: "Member referral", WAITLIST_FIFO: "Waitlist · earliest first", WAITLIST_RANDOM: "Waitlist · random", WAITLIST_MANUAL: "Waitlist · manual", ADMIN: "Administrator" };
function Metrics({ items }: { items: Array<[string, ReactNode]> }) {
  return <dl className={styles.metrics} style={{ "--metric-count": items.length } as CSSProperties}>{items.map(([label, value]) => <div className={styles.metric} key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function Table({ caption, headings, rows }: { caption: string; headings: string[]; rows: ReactNode[][] }) {
  return <div className={styles.scroll} role="region" aria-label={caption} tabIndex={0}><table className={styles.table}><caption>{caption}</caption><thead><tr>{headings.map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((value, j) => j === 0 ? <th scope="row" key={j}>{value}</th> : <td key={j}>{value}</td>)}</tr>)}</tbody></table></div>;
}
function utc(value: string) { return `${value.slice(0, 16).replace("T", " ")} UTC`; }
export function AdminReportView({ report: r, limits, saved = false, view = "growth" }: { report: ReportData; limits: { day: number; month: number }; saved?: boolean; view?: ReportView }) {
  const a = r.accounts, w = r.waitlist, o = r.operations;
  return <>
    <section className="admin-report-highlights" aria-label="Range highlights"><Metrics items={[["New accounts", a.created], ["Active members", a.activeInRange], ["Completed follow-ups", r.daily.reduce((sum, day) => sum + day.completed, 0)]]} /></section>
    <div className="admin-report-grid"><div className="admin-report-domain">

    {view === "growth" && <section className="card form-stack"><h2>Waitlist</h2>
      <Metrics items={[[saved ? "Confirmed waiting when observed" : "Confirmed waiting now", w.waitingNow], ["Oldest confirmed request", w.oldestWaitingDays === null ? "—" : `${w.oldestWaitingDays} days`], ["Requests in range", w.requested], ["Those requests joined", `${w.joined} (${reportRatio(w.joined, w.requested)})`]]} />
      <details><summary>Definitions and scope</summary><p>Of the requests created in this range: {w.confirmed} confirmed their email, {w.granted} received access, {w.joined} joined, and {w.withdrawn} are withdrawn. Outcomes include changes up to this report’s observation time.</p><p>Waiting count and age cover the confirmed waiting list at observation time, across all dates. Suppression and account eligibility checks may reduce the number who can receive a wave.</p></details>
    </section>}
    {view === "growth" && <section className="card form-stack"><h2>New account activation</h2>
      <Metrics items={[["New accounts", a.created], ["Verified email", a.verified], ["Setup complete", a.setup], ["Has a contact", a.withContact], ["Has a prepared mix", a.withMix], ["Activated", `${a.activated} (${reportRatio(a.activated, a.created)})`]]} />
      <details><summary>Definitions and scope</summary><p>Accounts created in the selected range, observed through this report’s calculation time.</p><p>Activated means setup is complete and the member has recorded a completed follow-up. A copied message or opened composer counts as use, but does not prove a message was sent or received.</p></details>
    </section>}
    {view === "engagement" && <section className="card form-stack"><h2>Member activity and return visits</h2>
      <Metrics items={[["Active members in range", a.activeInRange], ["D7 return", <>{reportRatio(a.d7Returned, a.d7Eligible)}<small>{a.d7Returned} / {a.d7Eligible} eligible</small></>], ["D30 return", <>{reportRatio(a.d30Returned, a.d30Eligible)}<small>{a.d30Returned} / {a.d30Eligible} eligible</small></>]]} />
      <details><summary>Definitions and scope</summary><p>D7: {a.d7Returned} returned out of {a.d7Eligible} eligible accounts. D30: {a.d30Returned} returned out of {a.d30Eligible} eligible accounts.</p><p>Return cohorts include new accounts with meaningful use in their first seven days. D7 measures use between 7 and 8 days after account creation; D30 measures days 30 to 31. Accounts whose entire return window has not elapsed are left out of that denominator. Active members covers all account ages and is counted once across the selected range.</p></details>
    </section>}
    {view === "content" && <section className="card form-stack"><h2>Ready-made mix use</h2>
      {r.library.length ? <Table caption="Library copies and follow-up outcomes in range" headings={["Library mix", "Copied version", "New copies", "Completed", "Skipped", "Connected"]} rows={r.library.map(m => [m.title, m.version ?? "Legacy · unknown", m.copies, m.completed, m.skipped, m.connected])} /> : <p>No retained library activity in this range.</p>}
      <details><summary>Definitions and scope</summary><p>Up to 20 library versions with activity, ordered by completed follow-ups and new copies. Counts use retained customer copies of the published library version.</p><p>Completed and skipped follow-ups are separate current statuses and can include automatic completion. Connected counts follow-ups where the member recorded that outcome; it is not a response detected by Jump.</p></details>
    </section>}
    {view === "operations" && <section className="card form-stack"><h2>Operations and usage at observation</h2>
      <Metrics items={[["Invitations queued / sending", o.queuedInvitations], ["Oldest queued invitation", o.oldestInvitationHours === null ? "—" : `${o.oldestInvitationHours} hours`], ["Invitations needing review", o.invitationReviews], ["Due unfinished jobs", o.overdueJobs], ["Failed jobs retained", o.failedJobs], ["Database size", `${Math.round(o.databaseBytes / 1024 / 1024 * 10) / 10} MiB`], [saved ? "24h attempts / current limit" : "24h attempts / limit", `${o.emailDayUsed} / ${limits.day}`], [saved ? "31d attempts / current limit" : "31d attempts / limit", `${o.emailMonthUsed} / ${limits.month}`]]} />
      <details><summary>Definitions and scope</summary><p>Email limits are the application’s configured ceilings, including its essential-email reserve. Attempts include retries and all staff/test traffic. They may differ from provider usage totals. Database size covers the entire connected database, including indexes and any other schemas.</p><p>Hosting bandwidth, CPU, and dollar costs are not connected to this report. Use the hosting and email provider dashboards for actual charges.</p></details>
    </section>}
    </div>    <aside className="card form-stack admin-report-trend"><h2>Daily activity</h2><ReportTrend daily={r.daily} />
      <details><summary>Show daily values ({r.daily.length} days)</summary><Table caption="Daily totals in UTC" headings={["Day", "New accounts", "Requests", "Invitations issued", "Invitations accepted", "Active members", "Completed", "Skipped", "Email attempts", "Email failures", "Job failures"]} rows={r.daily.map(d => [d.day, d.accounts, d.requests, d.issued, d.accepted, d.active, d.completed, d.skipped, d.emailAttempts, d.emailFailures, d.jobFailures])} /></details>
    </aside>
    </div>
    {view === "growth" && <details className="card form-stack"><summary>Invitation conversion</summary>
      <p>Invitations created in the range; joins and delivery outcomes observed through this report’s calculation time. Each invitation counts once, including when its email is sent again. Earlier delivery receipts remain included; queued and review counts describe the latest send.</p>
      {r.sources.length ? <Table caption="Invitation cohorts by source" headings={["Source", "Issued", "Joined", "Join rate", "Activated", "Inviting members", "Median time to join", "Provider accepted", "Delivery receipt", "Queued / sending", "Needs review", "Revoked"]} rows={r.sources.map(s => [sourceNames[s.source] ?? s.source, s.issued, s.accepted, reportRatio(s.accepted, s.issued), s.activated, s.invitingMembers, s.medianJoinHours === null ? "—" : `${s.medianJoinHours} hours`, s.providerAccepted, s.delivered, s.queued, s.review, s.revoked])} /> : <p>No invitations were created in this range.</p>}
      <p>Median time to join includes accepted invitations only. It does not estimate when outstanding invitations will be accepted. Provider acceptance and delivery receipts describe email transport; neither proves an inbox placement, a read, or a successful referral.</p>
    </details>}
    {view === "growth" && <details className="card form-stack"><summary>Waitlist waves</summary>
      <p>The latest 30 waves released in this range. Selection counts record the release; invitation outcomes use the records still retained.</p>
      {r.waves.length ? <Table caption="Recent wave outcomes" headings={["Released", "Scheduled", "Earliest first", "Random", "Retained invitations", "Queued / sending", "Needs review", "Provider accepted", "Delivery receipt", "Joined", "Activated"]} rows={r.waves.map(wave => [utc(wave.releasedAt), utc(wave.scheduledFor), wave.fifo, wave.random, wave.retainedInvites, wave.queued, wave.review, wave.providerAccepted, wave.delivered, wave.accepted, wave.activated])} /> : <p>No waves were released in this range.</p>}
    </details>}
    <details className="card form-stack"><summary>Definitions and limits for these numbers</summary>
      <p>Growth and activity exclude staff-only, demo and configured test accounts. Completed totals use retained follow-up statuses.</p><p>These are {saved ? "saved" : "live"} aggregates of retained records. They contain no customer names, email addresses, contact details, private notes, or message bodies. Library titles are platform catalog content.</p>
      <p>Meaningful use is an authenticated owner copying a message, opening a composer, starting a call or voicemail, recording an outcome, or marking a follow-up done, skipped, or reopened. Page opens, automated sends, support actions, and staff-only accounts are excluded. The demo account and configured test accounts are excluded from growth and activity metrics.</p>
      <p>Deleting records, rejoining the waitlist, changing setup, reopening follow-ups, and clearing failures can change earlier totals. This is not an immutable historical snapshot. Daily active counts cannot be added to get unique active members for a longer period. A dash means there is no eligible denominator or observation.</p>
    </details>
  </>;
}
