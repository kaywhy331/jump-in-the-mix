"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { Notice } from "@/components/Notice";
import {
  buildImportRows,
  contactNameForImport,
  createImportErrorCsv,
  createSampleImportCsv,
  decodeMappingTarget,
  encodeMappingTarget,
  guessImportMappings,
  parseContactFile,
  type ImportColumnMapping,
  type ImportCommitResult,
  type ImportCustomFieldOption,
  type ImportDateTypeOption,
  type ImportMappingTarget,
  type ImportMatch,
  type ImportResolution,
  type ImportResolutionAction,
  type ParsedImportTable,
  type PreparedImportRow
} from "@/lib/contact-import";

export type ContactImportGroup = {
  id: string;
  name: string;
  contactCount: number;
};

type ImportUsage = {
  activeContacts: number;
  contactLimit: number;
  remainingContacts: number;
};

type ImportBatch = {
  id: string;
  importId: string;
  sourceFileName: string | null;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELED";
  totalRows: number;
  processedRows: number;
  progress: number;
  createdCount: number;
  mergedCount: number;
  replacedCount: number;
  skippedCount: number;
  failedCount: number;
  results: ImportCommitResult[];
  errorSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type Stage = "CHOOSE" | "REVIEW" | "RESULTS";

const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "ignore", label: "Do not import" },
  { value: "field:firstName", label: "Contact · First name" },
  { value: "field:lastName", label: "Contact · Last name" },
  { value: "field:displayName", label: "Contact · Full/display name" },
  { value: "field:company", label: "Contact · Company" },
  { value: "field:email", label: "Contact · Email" },
  { value: "field:phone", label: "Contact · Phone" },
  { value: "field:address", label: "Contact · Full address" },
  { value: "field:street1", label: "Contact · Address line 1" },
  { value: "field:street2", label: "Contact · Address line 2" },
  { value: "field:city", label: "Contact · City" },
  { value: "field:state", label: "Contact · State / region" },
  { value: "field:postalCode", label: "Contact · ZIP / postal code" },
  { value: "field:country", label: "Contact · Country" },
  { value: "field:publicNotes", label: "Contact · Notes" }
];

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function downloadText(fileName: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function importRequest<T>(payload: unknown): Promise<T> {
  const response = await fetch("/api/contacts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || "The import request failed.");
  return body as T;
}

function makeImportId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `import-${crypto.randomUUID()}`;
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function mappingOptionsForHeader(header: string, dateTypes: ImportDateTypeOption[], customFields: ImportCustomFieldOption[]) {
  const options = [...FIELD_OPTIONS];
  for (const field of customFields) options.push({ value: `custom:${field.id}`, label: `Custom field · ${field.name}` });
  for (const type of dateTypes) {
    for (const recurrence of ["NONE", "MONTHLY", "YEARLY"] as const) {
      options.push({
        value: encodeMappingTarget({ kind: "DATE", dateTypeId: type.id, dateTypeName: null, recurrence }),
        label: `Saved date · ${type.name} · ${recurrence === "NONE" ? "one time" : recurrence.toLowerCase()}`
      });
    }
  }
  const inferredName = header.replace(/[_-]+/g, " ").replace(/\b(date|dt)\b/gi, "").replace(/\s+/g, " ").trim() || "Imported Date";
  for (const recurrence of ["NONE", "MONTHLY", "YEARLY"] as const) {
    const target: ImportMappingTarget = { kind: "DATE", dateTypeId: null, dateTypeName: inferredName, recurrence };
    options.push({ value: encodeMappingTarget(target), label: `New saved date type · ${inferredName} · ${recurrence === "NONE" ? "one time" : recurrence.toLowerCase()}` });
  }
  return options;
}

function defaultResolution(match: ImportMatch): ImportResolution {
  return { rowId: match.rowId, action: match.recommendedAction, targetContactId: match.candidates[0]?.contactId ?? null };
}

function actionLabel(action: ImportResolutionAction): string {
  if (action === "CREATE") return "Create new Contact";
  if (action === "MERGE") return "Merge without overwriting";
  if (action === "REPLACE") return "Prefer imported values";
  return "Skip row";
}

function terminal(status: ImportBatch["status"]): boolean {
  return ["COMPLETED", "PARTIAL", "FAILED", "CANCELED"].includes(status);
}

function batchDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ContactImportWizardV2({
  groups,
  customFields,
  dateTypes,
  initialUsage
}: {
  groups: ContactImportGroup[];
  customFields: ImportCustomFieldOption[];
  dateTypes: ImportDateTypeOption[];
  initialUsage: ImportUsage;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("CHOOSE");
  const [table, setTable] = useState<ParsedImportTable | null>(null);
  const [mapping, setMapping] = useState<ImportColumnMapping>({});
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [preparedRows, setPreparedRows] = useState<PreparedImportRow[]>([]);
  const [matches, setMatches] = useState<ImportMatch[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution>>({});
  const [usage, setUsage] = useState(initialUsage);
  const [importId, setImportId] = useState(makeImportId);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [recentBatches, setRecentBatches] = useState<ImportBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validRows = useMemo(() => preparedRows.filter((row) => row.errors.length === 0), [preparedRows]);
  const invalidRows = useMemo(() => preparedRows.filter((row) => row.errors.length > 0), [preparedRows]);
  const matchByRow = useMemo(() => new Map(matches.map((match) => [match.rowId, match])), [matches]);
  const issueRows = useMemo(() => preparedRows.filter((row) => row.errors.length > 0 || (matchByRow.get(row.record.rowId)?.kind ?? "NONE") !== "NONE"), [preparedRows, matchByRow]);
  const cleanRows = validRows.length - issueRows.filter((row) => row.errors.length === 0).length;
  const planned = useMemo(() => {
    const values = Object.values(resolutions);
    return {
      create: values.filter((item) => item.action === "CREATE").length,
      merge: values.filter((item) => item.action === "MERGE").length,
      replace: values.filter((item) => item.action === "REPLACE").length,
      skip: values.filter((item) => item.action === "SKIP").length + invalidRows.length
    };
  }, [resolutions, invalidRows.length]);

  const loadRecent = async () => {
    const response = await fetch("/api/contacts/import", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { batches?: ImportBatch[] };
    if (!response.ok) return;
    const batches = payload.batches ?? [];
    setRecentBatches(batches);
    const active = batches.find((item) => !terminal(item.status));
    if (active && !batch) {
      setBatch(active);
      setStage("RESULTS");
    }
  };

  useEffect(() => { void loadRecent(); }, []);

  useEffect(() => {
    if (!batch || terminal(batch.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/contacts/import?batchId=${encodeURIComponent(batch.id)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { batch?: ImportBatch };
      if (!response.ok || !payload.batch) return;
      setBatch(payload.batch);
      if (terminal(payload.batch.status)) void loadRecent();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [batch?.id, batch?.status]);

  const analyze = async (sourceTable: ParsedImportTable, sourceMapping: ImportColumnMapping, sourceGroups: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const rows = buildImportRows(sourceTable, sourceMapping, sourceGroups);
      if (!rows.length) throw new Error("No Contact rows were found after mapping.");
      const analyzable = rows.filter((row) => row.errors.length === 0).map((row) => row.record);
      const collected: ImportMatch[] = [];
      let currentUsage = usage;
      for (const group of chunk(analyzable, 100)) {
        const response = await importRequest<{ matches: ImportMatch[]; usage: ImportUsage }>({ mode: "match", records: group });
        collected.push(...response.matches);
        currentUsage = response.usage;
      }
      setPreparedRows(rows);
      setMatches(collected);
      setResolutions(Object.fromEntries(collected.map((match) => [match.rowId, defaultResolution(match)])));
      setUsage(currentUsage);
      setStage("REVIEW");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be analyzed.");
    } finally {
      setBusy(false);
    }
  };

  const selectFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = parseContactFile(await file.text(), file.name);
      const guessed = guessImportMappings(parsed.headers, dateTypes, customFields);
      setTable(parsed);
      setMapping(guessed);
      setImportId(makeImportId());
      await analyze(parsed, guessed, selectedGroups);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected file could not be read.");
      setBusy(false);
    }
  };

  const updateResolution = (rowId: string, patch: Partial<ImportResolution>) => {
    setResolutions((current) => ({
      ...current,
      [rowId]: { ...(current[rowId] ?? { rowId, action: "SKIP", targetContactId: null }), ...patch, rowId }
    }));
  };

  const queueImport = async (onlyFailed = false) => {
    if (!table) return;
    setBusy(true);
    setError(null);
    try {
      const failedIds = onlyFailed && batch
        ? new Set(batch.results.filter((item) => item.status === "FAILED").map((item) => item.rowId))
        : null;
      const selectedRows = validRows.filter((row) => !failedIds || failedIds.has(row.record.rowId));
      const items = selectedRows.map((row) => ({
        record: row.record,
        resolution: resolutions[row.record.rowId] ?? { rowId: row.record.rowId, action: "SKIP" as const, targetContactId: null }
      }));
      const initialResults: ImportCommitResult[] = failedIds ? [] : invalidRows.map((row) => ({
        rowId: row.record.rowId,
        sourceRow: row.record.sourceRow,
        status: "FAILED",
        contactId: null,
        message: row.errors.join("; ")
      }));
      const nextImportId = onlyFailed ? makeImportId() : importId;
      const response = await importRequest<{ batch: ImportBatch }>({
        mode: "queue",
        importId: nextImportId,
        sourceFileName: table.fileName,
        items,
        initialResults
      });
      setImportId(nextImportId);
      setBatch(response.batch);
      setStage("RESULTS");
      void loadRecent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import could not be queued.");
    } finally {
      setBusy(false);
    }
  };

  const cancelBatch = async () => {
    if (!batch) return;
    const response = await fetch(`/api/contacts/import?batchId=${encodeURIComponent(batch.id)}`, { method: "DELETE" });
    if (response.ok) {
      setBatch({ ...batch, status: "CANCELED", errorSummary: "Canceled by user.", completedAt: new Date().toISOString() });
      void loadRecent();
    }
  };

  const reset = () => {
    setStage("CHOOSE");
    setTable(null);
    setMapping({});
    setPreparedRows([]);
    setMatches([]);
    setResolutions({});
    setUsage(initialUsage);
    setImportId(makeImportId());
    setBatch(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadErrors = () => {
    if (!batch?.failedCount) return;
    downloadText(`jump-in-the-mix-import-errors-${new Date().toISOString().slice(0, 10)}.csv`, createImportErrorCsv(batch.results));
  };

  return (
    <div className="import-wizard">
      <ol className="import-stepper" aria-label="Contact import progress">
        {["Choose file", "Review issues", "Results"].map((label, index) => {
          const active = stage === "CHOOSE" ? 0 : stage === "REVIEW" ? 1 : 2;
          return <li className={index < active ? "complete" : index === active ? "active" : ""} key={label} aria-current={index === active ? "step" : undefined}><span>{index < active ? <AppIcon name="check" /> : index + 1}</span><strong>{label}</strong></li>;
        })}
      </ol>

      {error && <Notice type="error">{error}</Notice>}

      {stage === "CHOOSE" && (
        <section className="card import-stage">
          <div className="import-stage-heading">
            <div><h2>Choose a Contact file</h2><p>Clean files move directly to review. Mapping and duplicate details appear only when a decision is needed.</p></div>
            <button className="button" type="button" onClick={() => downloadText("jump-in-the-mix-contact-import-sample.csv", createSampleImportCsv())}>Download sample CSV</button>
          </div>
          <label className="import-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void selectFile(event.dataTransfer.files?.[0] ?? null); }}>
            <input ref={fileInputRef} type="file" accept=".csv,.vcf,.vcard,text/csv,text/vcard" onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} disabled={busy} />
            <span className="import-drop-icon"><AppIcon name="import" /></span>
            <strong>{busy ? "Analyzing file…" : "Choose a CSV or VCF file"}</strong>
            <small>Up to 5,000 rows and 10 MB. You may leave after the import is queued.</small>
          </label>
          <div className="import-privacy-note"><strong>Only your account can access the contacts you import.</strong><span>We check for matching email addresses and phone numbers. You decide what to do with possible duplicates.</span></div>
        </section>
      )}

      {stage === "REVIEW" && table && (
        <section className="card import-stage">
          <div className="import-stage-heading">
            <div><h2>Review issues</h2><p>{table.fileName} · {table.rows.length.toLocaleString()} rows · {cleanRows.toLocaleString()} clean rows require no additional decision.</p></div>
            <button className="button" type="button" onClick={reset}>Choose another file</button>
          </div>

          <details>
            <summary>Review or adjust field mapping</summary>
            <div className="import-mapping-list">
              {table.headers.map((header) => {
                const samples = table.rows.map((row) => row[header]).filter(Boolean).slice(0, 3);
                return <label className="import-mapping-row" key={header}><span><strong>{header}</strong><small>{samples.join(" · ") || "No sample value"}</small></span><select value={mapping[header] ?? "ignore"} onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value }))}>{mappingOptionsForHeader(header, dateTypes, customFields).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
              })}
            </div>
            {groups.length > 0 && <fieldset className="import-groups"><legend>Add optional tags to imported contacts</legend><div className="group-choice-grid">{groups.map((group) => <label className="checkbox-card" key={group.id}><input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => setSelectedGroups((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])} /><span><strong>{group.name}</strong><small>{group.contactCount} current contacts</small></span></label>)}</div></fieldset>}
            <button className="button" type="button" disabled={busy} onClick={() => void analyze(table, mapping, selectedGroups)}>{busy ? "Reanalyzing…" : "Apply mapping changes"}</button>
          </details>

          <div className="import-summary-grid">
            <div><strong>{planned.create}</strong><span>Create</span></div>
            <div><strong>{planned.merge}</strong><span>Merge</span></div>
            <div><strong>{planned.replace}</strong><span>Prefer imported</span></div>
            <div><strong>{planned.skip}</strong><span>Skip / invalid</span></div>
          </div>

          {issueRows.length ? <div className="import-dedupe-list">{issueRows.map((row) => {
            if (row.errors.length) return <article className="import-dedupe-card invalid" key={row.record.rowId}><div><span className="status-pill">Row {row.record.sourceRow}</span><h3>{contactNameForImport(row.record)}</h3><p>{row.errors.join(" · ")}</p></div><strong>Will be reported as failed</strong></article>;
            const match = matchByRow.get(row.record.rowId);
            if (!match) return null;
            const resolution = resolutions[row.record.rowId] ?? defaultResolution(match);
            const actions: ImportResolutionAction[] = match.kind === "NONE" ? ["CREATE", "SKIP"] : match.kind === "FUZZY" ? ["MERGE", "REPLACE", "CREATE", "SKIP"] : ["MERGE", "REPLACE", "SKIP"];
            return <article className="import-dedupe-card" key={row.record.rowId}><div className="import-dedupe-source"><span className="status-pill">Row {row.record.sourceRow}</span><h3>{contactNameForImport(row.record)}</h3><p>{row.record.company || row.record.emails[0]?.value || row.record.phones[0]?.value || "No Contact method"}</p></div><div className="import-match-detail"><strong>{match.kind === "EXACT" ? "Exact duplicate" : match.kind === "AMBIGUOUS" ? "Multiple exact matches" : "Possible duplicate"}</strong>{match.candidates.length > 0 && <><select aria-label={`Existing Contact for row ${row.record.sourceRow}`} value={resolution.targetContactId ?? match.candidates[0]?.contactId ?? ""} onChange={(event) => updateResolution(row.record.rowId, { targetContactId: event.target.value })}>{match.candidates.map((candidate) => <option key={candidate.contactId} value={candidate.contactId}>{candidate.displayName}{candidate.company ? ` · ${candidate.company}` : ""}</option>)}</select><small>{match.candidates.find((candidate) => candidate.contactId === (resolution.targetContactId ?? match.candidates[0]?.contactId))?.matchReasons.join(" · ")}</small></>}</div><label className="field"><span>Decision</span><select value={resolution.action} onChange={(event) => updateResolution(row.record.rowId, { action: event.target.value as ImportResolutionAction })}>{actions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}</select></label></article>;
          })}</div> : <div className="empty-state compact"><h3>No issues need review</h3><p>Every row is ready to create.</p></div>}

          <div className="import-stage-actions"><button className="button" type="button" onClick={reset}>Back</button><button className="button primary" type="button" disabled={busy || !validRows.length} onClick={() => void queueImport()}>{busy ? "Queueing…" : `Queue ${validRows.length} valid row${validRows.length === 1 ? "" : "s"}`}</button></div>
        </section>
      )}

      {stage === "RESULTS" && batch && (
        <section className="card import-stage" aria-live="polite">
          <div className="import-stage-heading"><div><h2>{terminal(batch.status) ? "Import results" : "Import is running"}</h2><p>{batch.sourceFileName || "Contact import"} · created {batchDate(batch.createdAt)}. You may close this page; the worker will continue.</p></div><span className={`status-pill ${batch.status === "COMPLETED" ? "done" : ""}`}>{batch.status.toLowerCase()}</span></div>
          <progress max={100} value={batch.progress} />
          <p><strong>{batch.processedRows.toLocaleString()} of {batch.totalRows.toLocaleString()}</strong> rows processed · {batch.progress}%</p>
          <div className="import-summary-grid result"><div><strong>{batch.createdCount}</strong><span>Created</span></div><div><strong>{batch.mergedCount + batch.replacedCount}</strong><span>Updated</span></div><div><strong>{batch.skippedCount}</strong><span>Skipped</span></div><div className={batch.failedCount ? "failed" : ""}><strong>{batch.failedCount}</strong><span>Failed</span></div></div>
          {batch.errorSummary && <Notice type={batch.status === "FAILED" ? "error" : "info"}>{batch.errorSummary}</Notice>}
          {batch.failedCount > 0 && <div className="import-error-actions"><button className="button" type="button" onClick={downloadErrors}>Download error CSV</button>{table && terminal(batch.status) && <button className="button" type="button" disabled={busy} onClick={() => void queueImport(true)}>Retry failed rows</button>}</div>}
          <div className="import-result-list">{batch.results.filter((result) => result.status === "FAILED").slice(0, 20).map((result) => <div key={result.rowId}><strong>Row {result.sourceRow}</strong><span>{result.message}</span></div>)}</div>
          <div className="import-stage-actions">{!terminal(batch.status) && <button className="button danger" type="button" onClick={() => void cancelBatch()}>Cancel import</button>}<button className="button" type="button" onClick={reset}>Import another file</button><Link className="button primary" href={`/contacts?importBatch=${encodeURIComponent(batch.id)}`}>View imported Contacts</Link></div>
        </section>
      )}

      {recentBatches.length > 0 && (
        <section className="card import-stage">
          <div className="import-stage-heading"><div><h2>Recent imports</h2><p>Resume progress, review errors, or confirm completed batches.</p></div></div>
          <div className="import-result-list">{recentBatches.map((item) => <button type="button" className="contact-method-row" key={item.id} onClick={() => { setBatch(item); setStage("RESULTS"); }}><span><strong>{item.sourceFileName || "Contact import"}</strong><small>{batchDate(item.createdAt)} · {item.processedRows}/{item.totalRows} rows</small></span><span className="status-pill">{item.status.toLowerCase()}</span></button>)}</div>
        </section>
      )}
    </div>
  );
}
