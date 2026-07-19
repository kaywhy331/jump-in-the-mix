"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
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
  summarizeImportResults,
  type ImportColumnMapping,
  type ImportCommitResult,
  type ImportCustomFieldOption,
  type ImportDateTypeOption,
  type ImportMappingTarget,
  type ImportMatch,
  type ImportResolution,
  type ImportResolutionAction,
  type ImportSummary,
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

type WizardPhase = "UPLOAD" | "MAP" | "DEDUPE" | "REVIEW" | "IMPORT" | "SUMMARY";

const PHASES: { id: WizardPhase; label: string }[] = [
  { id: "UPLOAD", label: "Upload" },
  { id: "MAP", label: "Map" },
  { id: "DEDUPE", label: "Dedupe" },
  { id: "REVIEW", label: "Review" },
  { id: "IMPORT", label: "Import" },
  { id: "SUMMARY", label: "Summary" }
];

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
  { value: "field:publicNotes", label: "Contact · Public Notes" }
];

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
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

function newDateTypeNames(mapping: ImportColumnMapping): string[] {
  return [...new Set(
    Object.values(mapping)
      .map(decodeMappingTarget)
      .filter((target) => target.kind === "DATE" && !target.dateTypeId && target.dateTypeName)
      .map((target) => target.kind === "DATE" ? target.dateTypeName! : "")
  )];
}

function mappingOptionsForHeader(
  header: string,
  dateTypes: ImportDateTypeOption[],
  customFields: ImportCustomFieldOption[]
) {
  const options = [...FIELD_OPTIONS];
  for (const field of customFields) {
    options.push({ value: `custom:${field.id}`, label: `Custom field · ${field.name}` });
  }
  for (const type of dateTypes) {
    options.push({
      value: encodeMappingTarget({ kind: "DATE", dateTypeId: type.id, dateTypeName: null, recurrence: "NONE" }),
      label: `Important Date · ${type.name} · one time${type.isActive ? "" : " · inactive"}`
    });
    options.push({
      value: encodeMappingTarget({ kind: "DATE", dateTypeId: type.id, dateTypeName: null, recurrence: "MONTHLY" }),
      label: `Important Date · ${type.name} · monthly${type.isActive ? "" : " · inactive"}`
    });
    options.push({
      value: encodeMappingTarget({ kind: "DATE", dateTypeId: type.id, dateTypeName: null, recurrence: "YEARLY" }),
      label: `Important Date · ${type.name} · yearly${type.isActive ? "" : " · inactive"}`
    });
  }

  const inferredName = header
    .replace(/[_-]+/g, " ")
    .replace(/\b(date|dt)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "Imported Date";
  const newTargets: { target: ImportMappingTarget; label: string }[] = [
    { target: { kind: "DATE", dateTypeId: null, dateTypeName: inferredName, recurrence: "NONE" }, label: "one time" },
    { target: { kind: "DATE", dateTypeId: null, dateTypeName: inferredName, recurrence: "MONTHLY" }, label: "monthly" },
    { target: { kind: "DATE", dateTypeId: null, dateTypeName: inferredName, recurrence: "YEARLY" }, label: "yearly" }
  ];
  for (const item of newTargets) {
    options.push({ value: encodeMappingTarget(item.target), label: `New Important Date Type · ${inferredName} · ${item.label}` });
  }
  return options;
}

function defaultResolution(match: ImportMatch): ImportResolution {
  return {
    rowId: match.rowId,
    action: match.recommendedAction,
    targetContactId: match.candidates[0]?.contactId ?? null
  };
}

function actionLabel(action: ImportResolutionAction): string {
  if (action === "CREATE") return "Create new Contact";
  if (action === "MERGE") return "Merge without overwriting";
  if (action === "REPLACE") return "Prefer imported values";
  return "Skip row";
}

export function ContactImportWizard({
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
  const [phase, setPhase] = useState<WizardPhase>("UPLOAD");
  const [table, setTable] = useState<ParsedImportTable | null>(null);
  const [mapping, setMapping] = useState<ImportColumnMapping>({});
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [preparedRows, setPreparedRows] = useState<PreparedImportRow[]>([]);
  const [matches, setMatches] = useState<ImportMatch[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution>>({});
  const [usage, setUsage] = useState(initialUsage);
  const [importId, setImportId] = useState(makeImportId);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validRows = useMemo(() => preparedRows.filter((row) => row.errors.length === 0), [preparedRows]);
  const invalidRows = useMemo(() => preparedRows.filter((row) => row.errors.length > 0), [preparedRows]);
  const matchByRow = useMemo(() => new Map(matches.map((match) => [match.rowId, match])), [matches]);
  const reviewRows = useMemo(
    () => preparedRows.filter((row) => row.errors.length > 0 || (matchByRow.get(row.record.rowId)?.kind ?? "NONE") !== "NONE"),
    [preparedRows, matchByRow]
  );
  const planned = useMemo(() => {
    const values = Object.values(resolutions);
    return {
      create: values.filter((resolution) => resolution.action === "CREATE").length,
      merge: values.filter((resolution) => resolution.action === "MERGE").length,
      replace: values.filter((resolution) => resolution.action === "REPLACE").length,
      skip: values.filter((resolution) => resolution.action === "SKIP").length + invalidRows.length
    };
  }, [resolutions, invalidRows.length]);
  const exceedsContactLimit = planned.create > usage.remainingContacts;
  const activePhaseIndex = PHASES.findIndex((item) => item.id === phase);

  const reset = () => {
    setPhase("UPLOAD");
    setTable(null);
    setMapping({});
    setSelectedGroups([]);
    setPreparedRows([]);
    setMatches([]);
    setResolutions({});
    setUsage(initialUsage);
    setImportId(makeImportId());
    setProgress(0);
    setSummary(null);
    setBusy(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = parseContactFile(await file.text(), file.name);
      setTable(parsed);
      setMapping(guessImportMappings(parsed.headers, dateTypes, customFields));
      setPreparedRows([]);
      setMatches([]);
      setResolutions({});
      setSummary(null);
      setImportId(makeImportId());
      setPhase("MAP");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroups((current) => current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId]);
  };

  const analyze = async () => {
    if (!table) return;
    setBusy(true);
    setError(null);
    try {
      const rows = buildImportRows(table, mapping, selectedGroups);
      if (!rows.length) throw new Error("No Contact rows were found after mapping.");
      const analyzable = rows.filter((row) => row.errors.length === 0).map((row) => row.record);
      if (!analyzable.length) {
        setPreparedRows(rows);
        setMatches([]);
        setResolutions({});
        setPhase("DEDUPE");
        return;
      }

      const collected: ImportMatch[] = [];
      let currentUsage = usage;
      for (const batch of chunk(analyzable, 25)) {
        const response = await importRequest<{ matches: ImportMatch[]; usage: ImportUsage }>({ mode: "match", records: batch });
        collected.push(...response.matches);
        currentUsage = response.usage;
      }
      setPreparedRows(rows);
      setMatches(collected);
      setResolutions(Object.fromEntries(collected.map((match) => [match.rowId, defaultResolution(match)])));
      setUsage(currentUsage);
      setPhase("DEDUPE");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Duplicates could not be analyzed.");
    } finally {
      setBusy(false);
    }
  };

  const updateResolution = (rowId: string, patch: Partial<ImportResolution>) => {
    setResolutions((current) => ({
      ...current,
      [rowId]: { ...(current[rowId] ?? { rowId, action: "SKIP", targetContactId: null }), ...patch, rowId }
    }));
  };

  const commitRows = async (onlyRowIds?: Set<string>) => {
    setPhase("IMPORT");
    setBusy(true);
    setError(null);
    setProgress(0);
    const selectedValidRows = validRows.filter((row) => !onlyRowIds || onlyRowIds.has(row.record.rowId));
    const clientFailures: ImportCommitResult[] = onlyRowIds ? [] : invalidRows.map((row) => ({
      rowId: row.record.rowId,
      sourceRow: row.record.sourceRow,
      status: "FAILED",
      contactId: null,
      message: row.errors.join("; ")
    }));
    const results: ImportCommitResult[] = [];

    try {
      const batches = chunk(selectedValidRows, 25);
      for (let index = 0; index < batches.length; index += 1) {
        const items = batches[index].map((row) => ({
          record: row.record,
          resolution: resolutions[row.record.rowId]
            ?? { rowId: row.record.rowId, action: "SKIP" as const, targetContactId: null }
        }));
        const response = await importRequest<{ results: ImportCommitResult[] }>({ mode: "commit", importId, items });
        results.push(...response.results);
        setProgress(Math.round(((index + 1) / Math.max(batches.length, 1)) * 100));
      }
      const combined = onlyRowIds
        ? [...(summary?.results.filter((result) => !onlyRowIds.has(result.rowId)) ?? []), ...results]
        : [...clientFailures, ...results];
      setSummary(summarizeImportResults(combined));
      setPhase("SUMMARY");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The Contact import stopped unexpectedly.";
      const completedIds = new Set(results.map((result) => result.rowId));
      const interrupted = selectedValidRows
        .filter((row) => !completedIds.has(row.record.rowId))
        .map<ImportCommitResult>((row) => ({
          rowId: row.record.rowId,
          sourceRow: row.record.sourceRow,
          status: "FAILED",
          contactId: null,
          message
        }));
      const combined = onlyRowIds
        ? [...(summary?.results.filter((result) => !onlyRowIds.has(result.rowId)) ?? []), ...results, ...interrupted]
        : [...clientFailures, ...results, ...interrupted];
      setError(message);
      setSummary(summarizeImportResults(combined));
      setPhase("SUMMARY");
    } finally {
      setBusy(false);
    }
  };

  const retryFailed = () => {
    const validIds = new Set(validRows.map((row) => row.record.rowId));
    const failedIds = new Set(
      summary?.results
        .filter((result) => result.status === "FAILED" && validIds.has(result.rowId))
        .map((result) => result.rowId) ?? []
    );
    if (failedIds.size) void commitRows(failedIds);
  };

  const downloadErrors = () => {
    if (!summary?.failed) return;
    downloadText(
      `jump-in-the-mix-import-errors-${new Date().toISOString().slice(0, 10)}.csv`,
      createImportErrorCsv(summary.results)
    );
  };

  return (
    <div className="import-wizard">
      <ol className="import-stepper" aria-label="Contact import progress">
        {PHASES.map((item, index) => (
          <li
            className={index < activePhaseIndex ? "complete" : index === activePhaseIndex ? "active" : ""}
            key={item.id}
            aria-current={index === activePhaseIndex ? "step" : undefined}
          >
            <span>{index < activePhaseIndex ? "✓" : index + 1}</span>
            <strong>{item.label}</strong>
          </li>
        ))}
      </ol>

      {error && <Notice type="error">{error}</Notice>}

      {phase === "UPLOAD" && (
        <section className="card import-stage">
          <div className="import-stage-heading">
            <div><h2>Upload Contacts</h2><p>CSV and VCF files are parsed in this browser. Nothing is written until you approve the review.</p></div>
            <button className="button" type="button" onClick={() => downloadText("jump-in-the-mix-contact-import-sample.csv", createSampleImportCsv())}>Download sample CSV</button>
          </div>
          <label
            className="import-drop-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void selectFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.vcf,.vcard,text/csv,text/vcard"
              onChange={(event) => void selectFile(event.target.files?.[0] ?? null)}
              disabled={busy}
            />
            <span className="import-drop-icon" aria-hidden="true">⇧</span>
            <strong>{busy ? "Reading file…" : "Choose a CSV or VCF file"}</strong>
            <small>Up to 5,000 rows and 10 MB. Invalid rows remain downloadable in the final error report.</small>
          </label>
          <div className="import-privacy-note"><strong>Your data stays under your workspace.</strong><span>Exact duplicates are matched by normalized email first, then phone. Fuzzy matches always require your review.</span></div>
        </section>
      )}

      {phase === "MAP" && table && (
        <section className="card import-stage">
          <div className="import-stage-heading">
            <div><h2>Map fields</h2><p>{table.fileName} · {table.rows.length.toLocaleString()} Contact row{table.rows.length === 1 ? "" : "s"}</p></div>
            <button className="button" type="button" onClick={() => setPhase("UPLOAD")}>Choose another file</button>
          </div>
          {table.warnings.length > 0 && <Notice type="info">{table.warnings.slice(0, 3).join(" ")}</Notice>}
          <div className="import-mapping-list">
            {table.headers.map((header) => {
              const samples = table.rows.map((row) => row[header]).filter(Boolean).slice(0, 3);
              return (
                <label className="import-mapping-row" key={header}>
                  <span><strong>{header}</strong><small>{samples.join(" · ") || "No sample value"}</small></span>
                  <select
                    value={mapping[header] ?? "ignore"}
                    onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value }))}
                  >
                    {mappingOptionsForHeader(header, dateTypes, customFields).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>

          {groups.length > 0 && (
            <fieldset className="import-groups">
              <legend>Assign every imported Contact to optional groups</legend>
              <div className="group-choice-grid">
                {groups.map((group) => (
                  <label className="checkbox-card" key={group.id}>
                    <input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleGroup(group.id)} />
                    <span><strong>{group.name}</strong><small>{group.contactCount} current Contact{group.contactCount === 1 ? "" : "s"}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="import-stage-actions">
            <button className="button" type="button" onClick={() => setPhase("UPLOAD")}>Back</button>
            <button className="button primary" type="button" disabled={busy} onClick={() => void analyze()}>{busy ? "Analyzing…" : "Analyze duplicates"}</button>
          </div>
        </section>
      )}

      {phase === "DEDUPE" && (
        <section className="card import-stage">
          <div className="import-stage-heading"><div><h2>Review duplicates</h2><p>{validRows.length - reviewRows.filter((row) => row.errors.length === 0).length} rows have no possible duplicate and are ready to create automatically.</p></div></div>
          {reviewRows.length ? (
            <div className="import-dedupe-list">
              {reviewRows.map((row) => {
                const match = matchByRow.get(row.record.rowId);
                const resolution = resolutions[row.record.rowId];
                if (row.errors.length) {
                  return (
                    <article className="import-dedupe-card invalid" key={row.record.rowId}>
                      <div><span className="status-pill">Row {row.record.sourceRow}</span><h3>{contactNameForImport(row.record)}</h3><p>{row.errors.join(" · ")}</p></div>
                      <strong>Will be reported as failed</strong>
                    </article>
                  );
                }
                if (!match) return null;
                const actions: ImportResolutionAction[] = match.kind === "NONE"
                  ? ["CREATE", "SKIP"]
                  : match.kind === "FUZZY"
                    ? ["MERGE", "REPLACE", "CREATE", "SKIP"]
                    : ["MERGE", "REPLACE", "SKIP"];
                return (
                  <article className="import-dedupe-card" key={row.record.rowId}>
                    <div className="import-dedupe-source">
                      <span className="status-pill">Row {row.record.sourceRow}</span>
                      <h3>{contactNameForImport(row.record)}</h3>
                      <p>{row.record.company || row.record.emails[0]?.value || row.record.phones[0]?.value || "No Contact method"}</p>
                    </div>
                    <div className="import-match-detail">
                      <strong>{match.kind === "EXACT" ? "Exact duplicate found" : match.kind === "AMBIGUOUS" ? "More than one exact match" : match.kind === "FUZZY" ? "Possible duplicate" : "No duplicate"}</strong>
                      {match.candidates.length > 0 && (
                        <>
                          <select
                            aria-label={`Existing Contact for row ${row.record.sourceRow}`}
                            value={resolution?.targetContactId ?? match.candidates[0]?.contactId ?? ""}
                            onChange={(event) => updateResolution(row.record.rowId, { targetContactId: event.target.value })}
                          >
                            {match.candidates.map((candidate) => (
                              <option key={candidate.contactId} value={candidate.contactId}>{candidate.displayName}{candidate.company ? ` · ${candidate.company}` : ""}</option>
                            ))}
                          </select>
                          <small>{match.candidates.find((candidate) => candidate.contactId === (resolution?.targetContactId ?? match.candidates[0]?.contactId))?.matchReasons.join(" · ")}</small>
                        </>
                      )}
                    </div>
                    <div className="field">
                      <label htmlFor={`resolution-${row.record.rowId}`}>Import decision</label>
                      <select
                        id={`resolution-${row.record.rowId}`}
                        value={resolution?.action ?? match.recommendedAction}
                        onChange={(event) => updateResolution(row.record.rowId, { action: event.target.value as ImportResolutionAction })}
                      >
                        {actions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                      </select>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state compact"><h3>No duplicate review needed</h3><p>Every valid row is ready to create as a new Contact.</p></div>
          )}
          <div className="import-stage-actions">
            <button className="button" type="button" onClick={() => setPhase("MAP")}>Back</button>
            <button className="button primary" type="button" onClick={() => setPhase("REVIEW")}>Continue to review</button>
          </div>
        </section>
      )}

      {phase === "REVIEW" && table && (
        <section className="card import-stage">
          <div className="import-stage-heading"><div><h2>Confirm import</h2><p>Nothing has been written yet. Check plan usage and final decisions below.</p></div></div>
          <div className="import-summary-grid">
            <div><strong>{planned.create}</strong><span>Create</span></div>
            <div><strong>{planned.merge}</strong><span>Merge</span></div>
            <div><strong>{planned.replace}</strong><span>Prefer imported</span></div>
            <div><strong>{planned.skip}</strong><span>Skip / invalid</span></div>
          </div>
          <div className={`import-capacity ${exceedsContactLimit ? "over" : ""}`}>
            <div><strong>Contact capacity</strong><span>{usage.activeContacts.toLocaleString()} active + {planned.create.toLocaleString()} new of {usage.contactLimit.toLocaleString()}</span></div>
            <progress max={usage.contactLimit} value={Math.min(usage.activeContacts + planned.create, usage.contactLimit)} />
            {exceedsContactLimit && <p>This import would create {planned.create - usage.remainingContacts} more Contact{planned.create - usage.remainingContacts === 1 ? "" : "s"} than the current plan allows. Merge or skip more duplicate rows, archive Contacts, or <Link href="/plans">upgrade the plan</Link>.</p>}
          </div>
          {newDateTypeNames(mapping).length > 0 && <Notice type="info">New custom Important Date Types: {newDateTypeNames(mapping).join(", ")}. Types beyond the active plan allowance are preserved as inactive rather than deleted.</Notice>}
          <div className="import-review-preview">
            <h3>Sample of final decisions</h3>
            {preparedRows.slice(0, 12).map((row) => (
              <div key={row.record.rowId}><span>{contactNameForImport(row.record)}</span><strong>{row.errors.length ? "Invalid" : actionLabel(resolutions[row.record.rowId]?.action ?? "SKIP")}</strong></div>
            ))}
            {preparedRows.length > 12 && <small>+{preparedRows.length - 12} more rows</small>}
          </div>
          <div className="import-stage-actions">
            <button className="button" type="button" onClick={() => setPhase("DEDUPE")}>Back</button>
            <button className="button primary" type="button" disabled={exceedsContactLimit || busy} onClick={() => void commitRows()}>{exceedsContactLimit ? "Resolve plan limit first" : `Import ${validRows.length} row${validRows.length === 1 ? "" : "s"}`}</button>
          </div>
        </section>
      )}

      {phase === "IMPORT" && (
        <section className="card import-stage import-progress-stage" aria-live="polite">
          <div className="import-progress-icon" aria-hidden="true">↻</div>
          <h2>Importing Contacts</h2>
          <p>Each row is saved independently, so one invalid Contact will not roll back successful rows.</p>
          <progress max={100} value={progress} />
          <strong>{progress}%</strong>
          {error && summary && <button className="button" type="button" onClick={() => setPhase("SUMMARY")}>View partial results</button>}
        </section>
      )}

      {phase === "SUMMARY" && summary && (
        <section className="card import-stage">
          <div className="import-stage-heading"><div><h2>Import summary</h2><p>The import is complete. Matching Mixes will reconcile against imported Important Dates automatically.</p></div></div>
          <div className="import-summary-grid result">
            <div><strong>{summary.created}</strong><span>Created</span></div>
            <div><strong>{summary.merged + summary.replaced}</strong><span>Updated</span></div>
            <div><strong>{summary.skipped}</strong><span>Skipped</span></div>
            <div className={summary.failed ? "failed" : ""}><strong>{summary.failed}</strong><span>Failed</span></div>
          </div>
          {summary.failed > 0 && (
            <div className="notice error">
              <strong>{summary.failed} row{summary.failed === 1 ? "" : "s"} need attention.</strong>
              <div className="import-error-actions">
                <button className="button" type="button" onClick={downloadErrors}>Download error CSV</button>
                {summary.results.some((result) => result.status === "FAILED" && validRows.some((row) => row.record.rowId === result.rowId)) && (
                  <button className="button" type="button" onClick={retryFailed} disabled={busy}>Retry server failures</button>
                )}
              </div>
            </div>
          )}
          <div className="import-result-list">
            {summary.results.filter((result) => result.status === "FAILED").slice(0, 20).map((result) => (
              <div key={result.rowId}><strong>Row {result.sourceRow}</strong><span>{result.message}</span></div>
            ))}
          </div>
          <div className="import-stage-actions">
            <button className="button" type="button" onClick={reset}>Import another file</button>
            <Link className="button primary" href="/contacts">Return to Contacts</Link>
          </div>
        </section>
      )}
    </div>
  );
}
