"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Notice } from "@/components/Notice";

type GoogleRun = {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errorSummary: string | null;
};

type GoogleStatus = {
  configured: boolean;
  entitled: boolean;
  planTier: string;
  readOnly: boolean;
  connection: null | {
    id: string;
    status: string;
    accountEmail: string | null;
    accountName: string | null;
    selectedGroupResourceNames: string[];
    selectedGroupLabels: Record<string, string>;
    autoMergeExact: boolean;
    lastSummary: null | { created: number; updated: number; skipped: number; failed: number };
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    lastError: string | null;
    syncMode: string;
  };
  runs: GoogleRun[];
};

type GoogleGroup = {
  resourceName: string;
  name: string;
  groupType: string | null;
  memberCount: number;
};

type GooglePreview = {
  totalGoogleContacts: number;
  selectedContacts: number;
  createCount: number;
  updateCount: number;
  reviewCount: number;
  deletedCount: number;
  remainingContactCapacity: number;
  exceedsPlanBy: number;
  sample: Array<{
    rowId: string;
    externalId: string;
    displayName: string;
    company: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
    decision: string;
    reasons: string[];
    candidates: Array<{ contactId: string; displayName: string; company: string | null }>;
  }>;
};

function dateTime(value: string | null): string {
  if (!value) return "Not yet";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  const payload = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(payload?.error || "The Google Contacts request failed.");
  return payload as T;
}

function runActive(run: GoogleRun | undefined): boolean {
  return Boolean(run && ["QUEUED", "RUNNING"].includes(run.status));
}

function decisionLabel(value: string): string {
  if (value === "CREATE") return "New Contact";
  if (value === "MERGE") return "Exact merge";
  if (value === "LINKED") return "Linked update";
  if (value === "REVIEW") return "Review needed";
  if (value === "DELETED") return "Deleted in Google";
  return "Skipped";
}

export function GoogleContactsPanel() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [groups, setGroups] = useState<GoogleGroup[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => new Set());
  const [autoMergeExact, setAutoMergeExact] = useState(true);
  const [preview, setPreview] = useState<GooglePreview | null>(null);
  const [groupQuery, setGroupQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const next = await jsonRequest<GoogleStatus>("/api/integrations/google/status", { cache: "no-store" });
    setStatus(next);
    if (next.connection) {
      setSelectedGroups(new Set(next.connection.selectedGroupResourceNames));
      setAutoMergeExact(next.connection.autoMergeExact);
    }
    return next;
  }, []);

  const loadGroups = useCallback(async () => {
    setBusy("groups");
    setError(null);
    try {
      const result = await jsonRequest<{
        groups: GoogleGroup[];
        selectedGroupResourceNames: string[];
        autoMergeExact: boolean;
      }>("/api/integrations/google/groups", { cache: "no-store" });
      setGroups(result.groups);
      setSelectedGroups(new Set(result.selectedGroupResourceNames));
      setAutoMergeExact(result.autoMergeExact);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Contact groups could not be loaded.");
    } finally {
      setGroupsLoaded(true);
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus().catch((cause) => setError(cause instanceof Error ? cause.message : "Google status could not be loaded."));
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.connection || !status.configured || !status.entitled || groupsLoaded) return;
    void loadGroups();
  }, [groupsLoaded, loadGroups, status?.configured, status?.connection, status?.entitled]);

  const latestRun = status?.runs[0];
  useEffect(() => {
    if (!runActive(latestRun)) return;
    const timer = window.setInterval(() => {
      void loadStatus().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [latestRun, loadStatus]);

  useEffect(() => {
    if (!latestRun || runActive(latestRun)) return;
    if (latestRun.status === "COMPLETED" || latestRun.status === "COMPLETED_WITH_ERRORS") {
      setMessage(`Google sync finished: ${latestRun.createdCount} created, ${latestRun.updatedCount} updated, ${latestRun.skippedCount} held for review, ${latestRun.errorCount} failed.`);
    }
  }, [latestRun]);

  const visibleGroups = useMemo(() => {
    const query = groupQuery.trim().toLowerCase();
    return groups.filter((group) => !query || group.name.toLowerCase().includes(query));
  }, [groupQuery, groups]);

  const selectedGroupLabels = useMemo(() => Object.fromEntries(
    groups.filter((group) => selectedGroups.has(group.resourceName)).map((group) => [group.resourceName, group.name])
  ), [groups, selectedGroups]);

  const requestConfig = useMemo(() => ({
    selectedGroupResourceNames: [...selectedGroups],
    selectedGroupLabels,
    autoMergeExact
  }), [autoMergeExact, selectedGroupLabels, selectedGroups]);

  const toggleGroup = (resourceName: string) => {
    setPreview(null);
    setSelectedGroups((current) => {
      const next = new Set(current);
      if (next.has(resourceName)) next.delete(resourceName);
      else next.add(resourceName);
      return next;
    });
  };

  const previewContacts = async () => {
    setBusy("preview");
    setError(null);
    setMessage(null);
    try {
      const result = await jsonRequest<GooglePreview>("/api/integrations/google/preview", {
        method: "POST",
        body: JSON.stringify(requestConfig)
      });
      setPreview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Contacts could not be previewed.");
    } finally {
      setBusy(null);
    }
  };

  const startSync = async () => {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      const result = await jsonRequest<{ runId: string; mode: string }>("/api/integrations/google/sync", {
        method: "POST",
        body: JSON.stringify(requestConfig)
      });
      setMessage(result.mode === "ALREADY_RUNNING" ? "A Google sync is already running." : "Google Contacts sync queued. This page will update automatically.");
      await loadStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Contacts sync could not be started.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setError(null);
    setMessage(null);
    try {
      const result = await jsonRequest<{ disconnected: boolean; warning: string | null }>("/api/integrations/google/disconnect", { method: "POST", body: "{}" });
      setGroups([]);
      setGroupsLoaded(false);
      setPreview(null);
      setSelectedGroups(new Set());
      setMessage(result.warning ? `Disconnected locally. ${result.warning}` : "Google Contacts disconnected. Existing local Contacts were preserved.");
      await loadStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Contacts could not be disconnected.");
    } finally {
      setBusy(null);
    }
  };

  if (!status) {
    return <section className="card google-contacts-card"><p className="muted-copy">Loading Google Contacts connection…</p></section>;
  }

  const connected = Boolean(status.connection && status.connection.status !== "REVOKED");
  const activeSync = runActive(latestRun);

  return (
    <section className="card google-contacts-card" id="google-contacts">
      <div className="card-header google-card-header">
        <div>
          <h2>Google Contacts</h2>
          <p>One-way Google-to-Jump-in-the-Mix import with reviewed matching and daily incremental refresh.</p>
        </div>
        <span className={`status-pill ${connected ? "done" : "pending"}`}>{connected ? status.connection?.status.toLowerCase() : "not connected"}</span>
      </div>

      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      {!status.entitled ? (
        <div className="google-gate">
          <div><strong>Available on Plus and Pro</strong><p>Upgrade to import selected Google labels and keep them refreshed automatically.</p></div>
          <a className="button primary" href="/#pricing">View plans</a>
        </div>
      ) : !status.configured ? (
        <Notice type="info">Google Contacts needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and DATA_ENCRYPTION_KEY before accounts can connect.</Notice>
      ) : !connected ? (
        <div className="google-connect-state">
          <div>
            <strong>Connect a Google account</strong>
            <p>Jump in the Mix requests read-only Contacts access. It will not write changes back to Google.</p>
          </div>
          {!status.readOnly && <a className="button primary" href="/api/integrations/google/start?returnTo=/account">Connect Google</a>}
        </div>
      ) : (
        <>
          <div className="google-account-summary">
            <div><span>Connected account</span><strong>{status.connection?.accountName || status.connection?.accountEmail || "Google account"}</strong><small>{status.connection?.accountEmail}</small></div>
            <div><span>Last sync</span><strong>{dateTime(status.connection?.lastSyncAt ?? null)}</strong><small>Next scheduled: {dateTime(status.connection?.nextSyncAt ?? null)}</small></div>
            <div><span>Sync mode</span><strong>{status.connection?.syncMode === "incremental" ? "Incremental" : "Initial full sync"}</strong><small>Google changes are pulled one way.</small></div>
          </div>

          {status.connection?.lastError && <Notice type="error">{status.connection.lastError}</Notice>}

          <div className="google-config-grid">
            <section className="google-groups-panel">
              <div className="section-label"><h3>Choose Google labels</h3><span>{selectedGroups.size ? `${selectedGroups.size} selected` : "All contacts"}</span></div>
              <p className="muted-copy">Leave every label unselected to include all Google Contacts.</p>
              <div className="google-all-choice">
                <label className="checkbox-card"><input type="radio" checked={selectedGroups.size === 0} onChange={() => { setSelectedGroups(new Set()); setPreview(null); }} />All Google Contacts</label>
              </div>
              {groups.length > 8 && <input value={groupQuery} onChange={(event) => setGroupQuery(event.target.value)} placeholder="Search Google labels" aria-label="Search Google contact labels" />}
              <div className="google-group-list">
                {busy === "groups" ? <p className="muted-copy">Loading Google labels…</p> : visibleGroups.map((group) => (
                  <label className="google-group-row" key={group.resourceName}>
                    <input type="checkbox" checked={selectedGroups.has(group.resourceName)} onChange={() => toggleGroup(group.resourceName)} />
                    <span><strong>{group.name}</strong><small>{group.memberCount.toLocaleString()} contact{group.memberCount === 1 ? "" : "s"}{group.groupType ? ` · ${group.groupType.replaceAll("_", " ").toLowerCase()}` : ""}</small></span>
                  </label>
                ))}
              </div>
            </section>

            <section className="google-merge-panel">
              <div className="section-label"><h3>Duplicate policy</h3></div>
              <label className="checkbox-card google-policy-choice">
                <input type="checkbox" checked={autoMergeExact} onChange={(event) => { setAutoMergeExact(event.target.checked); setPreview(null); }} />
                <span><strong>Auto-merge exact email or phone matches</strong><small>Existing primary values remain selected. Similar or ambiguous matches are always held for review.</small></span>
              </label>
              <div className="google-safety-list">
                <span>✓ Email and phone normalization</span>
                <span>✓ No silent fuzzy merges</span>
                <span>✓ Public Notes keep source provenance</span>
                <span>✓ Private Notes are never imported</span>
                <span>✓ Google deletions do not delete local Contacts</span>
              </div>
              {!status.readOnly && <button className="button" type="button" onClick={() => void previewContacts()} disabled={Boolean(busy) || activeSync}>{busy === "preview" ? "Preparing preview…" : "Preview Contacts"}</button>}
            </section>
          </div>

          {preview && (
            <section className="google-preview-panel">
              <div className="section-label"><h3>Import preview</h3><span>Sample of up to 20</span></div>
              <div className="google-preview-metrics">
                <div><strong>{preview.selectedContacts.toLocaleString()}</strong><span>Selected</span></div>
                <div><strong>{preview.createCount.toLocaleString()}</strong><span>New</span></div>
                <div><strong>{preview.updateCount.toLocaleString()}</strong><span>Exact / linked</span></div>
                <div><strong>{preview.reviewCount.toLocaleString()}</strong><span>Held for review</span></div>
              </div>
              {preview.exceedsPlanBy > 0 && <Notice type="error">This import exceeds the current Contact limit by {preview.exceedsPlanBy.toLocaleString()}. Upgrade or archive Contacts before syncing.</Notice>}
              {preview.reviewCount > 0 && <Notice type="info">{preview.reviewCount.toLocaleString()} possible duplicate{preview.reviewCount === 1 ? " is" : "s are"} held safely instead of being merged automatically.</Notice>}
              <div className="google-preview-list">
                {preview.sample.map((item) => (
                  <article className="google-preview-row" key={item.rowId}>
                    <div><strong>{item.displayName}</strong><p>{[item.company, item.primaryEmail, item.primaryPhone].filter(Boolean).join(" · ") || "No contact method"}</p><small>{item.reasons.join(" ")}</small></div>
                    <span className={`status-pill ${item.decision === "REVIEW" ? "pending" : item.decision === "CREATE" ? "done" : ""}`}>{decisionLabel(item.decision)}</span>
                  </article>
                ))}
              </div>
              {!status.readOnly && <button className="button primary" type="button" onClick={() => void startSync()} disabled={Boolean(busy) || activeSync || preview.exceedsPlanBy > 0}>{busy === "sync" || activeSync ? "Sync in progress…" : status.connection?.lastSyncAt ? "Save settings & sync now" : "Import & enable daily sync"}</button>}
            </section>
          )}

          {!preview && !status.readOnly && status.connection?.lastSyncAt && (
            <button className="button primary" type="button" onClick={() => void startSync()} disabled={Boolean(busy) || activeSync}>{busy === "sync" || activeSync ? "Sync in progress…" : "Sync now"}</button>
          )}

          <section className="google-history-panel">
            <div className="section-label"><h3>Sync history</h3><span>{status.runs.length} recent</span></div>
            {status.runs.length ? <div className="google-run-list">{status.runs.map((run) => (
              <article className="google-run-row" key={run.id}>
                <span className={`status-pill ${run.status === "COMPLETED" ? "done" : run.status === "FAILED" ? "skipped" : "pending"}`}>{run.status.replaceAll("_", " ").toLowerCase()}</span>
                <div><strong>{run.mode.toLowerCase()} sync</strong><p>{run.createdCount} created · {run.updatedCount} updated · {run.skippedCount} skipped · {run.errorCount} failed</p><small>{dateTime(run.startedAt)}{run.errorSummary ? ` · ${run.errorSummary}` : ""}</small></div>
              </article>
            ))}</div> : <p className="muted-copy">No Google sync has run yet.</p>}
          </section>

          {!status.readOnly && (
            <details className="destructive-confirm google-disconnect">
              <summary className="button danger">Disconnect Google…</summary>
              <div className="destructive-confirm-panel"><p>Existing Contacts stay in Jump in the Mix. Daily Google refresh stops and stored credentials are removed.</p><button className="button danger" type="button" onClick={() => void disconnect()} disabled={Boolean(busy)}>{busy === "disconnect" ? "Disconnecting…" : "Confirm disconnect"}</button></div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
