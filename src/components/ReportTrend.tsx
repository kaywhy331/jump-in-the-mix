"use client";
import { useState } from "react";
import type { ReportData } from "@/lib/admin-report-data";
import styles from "./AdminReports.module.css";

const metrics = { accounts: "New accounts", requests: "Waitlist requests", accepted: "Accounts joined by invitation", active: "Active members", completed: "Completed follow-ups", emailAttempts: "Email attempts", emailFailures: "Email failures" } as const;
export function ReportTrend({ daily }: { daily: ReportData["daily"] }) {
  const [metric, setMetric] = useState<keyof typeof metrics>("accounts");
  const peak = Math.max(0, ...daily.map(row => row[metric]));
  const firstPeak = daily.find(row => row[metric] === peak)?.day;
  return <div className="form-stack">
    <label className="field"><span>Trend metric</span><select value={metric} onChange={e => setMetric(e.target.value as keyof typeof metrics)}>{Object.entries(metrics).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <figure className={styles.chart}>
      <div aria-hidden="true"><div className={styles.bars}>{daily.map(row => <div key={row.day} className={styles.bar} style={{ height: `${peak ? row[metric] / peak * 100 : 0}%` }} />)}</div><div className={styles.axis}><span>{daily[0]?.day}</span><span>{daily.at(-1)?.day}</span></div></div>
      <figcaption aria-live="polite">{metrics[metric]} per UTC day. {peak ? `Daily peak: ${peak} on ${firstPeak}${daily.filter(row => row[metric] === peak).length > 1 ? " (first tied day)" : ""}.` : "No recorded activity in this range."} Exact values are in the daily table below.</figcaption>
    </figure>
  </div>;
}
