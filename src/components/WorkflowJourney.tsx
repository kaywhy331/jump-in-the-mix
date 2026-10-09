"use client";

import Link from "next/link";
import type { WorkflowStartPreview } from "@/lib/workflow-start-preview";
import { workflowStartPath } from "@/lib/workflow-continuation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";
import { WorkflowCountStrip, WorkflowPeople } from "@/components/WorkflowPeople";
import { emptyWorkflowCounts } from "@/lib/workflow-analytics";
import { WorkflowSimulation } from "@/components/WorkflowSimulation";
import { useWorkflowConnections } from "@/components/WorkflowConnections";
import { WorkflowPathActions, type WorkflowPathSelection } from "@/components/WorkflowPathActions";
import type { WorkflowPathRemoval } from "@/lib/mix-workflow-rule-save";
import { WorkflowRuleEditor } from "@/components/WorkflowRuleEditor";
import { saveWorkflowChange, WorkflowInstanceCard } from "@/components/WorkflowProgress";
import { formatDateTime, formatTime, type DisplayFormatPreferences } from "@/lib/format";
import { WorkflowGraphEdges } from "@/components/WorkflowGraphEdges";
import { connectionDirection, layoutWorkflowConnections } from "@/lib/workflow-connection-layout";
import { layoutWorkflow } from "@/lib/mix-workflow-layout";
import type { WorkflowGraphView } from "@/lib/mix-workflow-view";
import { workflowNodeKey, type WorkflowConfiguration, type WorkflowRule, type WorkflowTarget } from "@/lib/mix-workflow-types";
import styles from "@/components/WorkflowJourney.module.css";
import { BrandTermsHelp } from "@/components/BrandTermsHelp";
import { compareJourneyNumbers, journeyTargetNumber, numberJourney } from "@/lib/journey-numbering";
import { useCanvasPan } from "@/components/useCanvasPan";
import { mixStatusLabel, zoneLabel } from "@/lib/display-labels";

export function WorkflowJourney({ initial, displayPreferences, initialMixId = "", initialContactId = "", children, showCheckIns = false, initialStartOpen = false, initialWorkLabel = "", initialInstanceId = "", initialMegaMixId = "" }: { children?: ReactNode; showCheckIns?: boolean; initial: WorkflowGraphView; displayPreferences: DisplayFormatPreferences; initialMixId?: string; initialContactId?: string; initialStartOpen?: boolean; initialWorkLabel?: string; initialInstanceId?: string; initialMegaMixId?: string }) {
  const [data, setData] = useState(initial), [mode, setMode] = useState<"Setup" | "Progress" | "Results">(initialStartOpen ? "Setup" : initial.analytics.summary.total ? "Progress" : "Setup");
  const [selected, setSelected] = useState(initialMixId || "");
  // "" shows every Mix; "none" shows Mixes outside any Mega-Mix; otherwise one named Mega-Mix.
  const [megaMix, setMegaMix] = useState(() => initialMegaMixId === "none" || initial.megaMixes.some(item => item.id === initialMegaMixId) ? initialMegaMixId : initial.megaMixes.find(item => item.mixIds.includes(initialMixId))?.id ?? "");
  const [expanded, setExpanded] = useState(new Set(initialMixId ? [initialMixId] : [])), [list, setList] = useState(false), [archived, setArchived] = useState(false), [zoom, setZoom] = useState(1);
  const [editing, setEditingState] = useState<WorkflowRule | "new" | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [contactId, setContactId] = useState(initialContactId), [offset, setOffset] = useState(0), [selectedInstance, setSelectedInstance] = useState(initialInstanceId);
  const [peopleFilter, setPeopleFilter] = useState({ node: initialMixId ? `mix:${initialMixId}` : "", status: "all", stage: "", query: "", offset: 0 });
  const [mapOptions, setMapOptions] = useState(false), [selectedRoute, setSelectedRoute] = useState("");
  const [pathSelection, setPathSelection] = useState<WorkflowPathSelection | null>(null);
  const [resultDays, setResultDays] = useState(30);
  const [pane, setPane] = useState<"people" | "map" | "details">(showCheckIns || initialStartOpen || initialInstanceId ? "details" : "map");
  const setEditing = (value: WorkflowRule | "new" | null) => { setEditingState(value); if (value) setPane("details"); };
  const directoryRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [savedView, setSavedView] = useState(false), [measure, setMeasure] = useState("starts"), [goalRoute, setGoalRoute] = useState("");
  const [fitMode, setFitMode] = useState(!initialMixId);
  const mapHeadingRef = useRef<HTMLHeadingElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null), graphRef = useRef<HTMLDivElement>(null);
  const connectionOrigin = useRef<HTMLButtonElement | null>(null);
  const [ports, setPorts] = useState<Record<string, number>>({});
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});
  const [startRequestId, setStartRequestId] = useState(() => crypto.randomUUID());
  const [target, setTarget] = useState(""), [minimum, setMinimum] = useState(10);
  const [startSearch, setStartSearch] = useState("");
  const [startLabel, setStartLabel] = useState(initialWorkLabel);
  const [startPerson, setStartPerson] = useState(initialContactId);
  const [startPreview, setStartPreview] = useState<WorkflowStartPreview | null>(null), [startPreviewError, setStartPreviewError] = useState("");
  const [startPreviewAttempt, setStartPreviewAttempt] = useState(0);
  const [startOpen, setStartOpen] = useState(initialStartOpen && initial.canEdit && Boolean(initialMixId)), [starting, setStarting] = useState(false);
  const startStorageKey = `jitm-start:${selected}:${startPerson}:${startLabel}`;
  useEffect(() => {
    if (!startOpen || !selected || !startPerson) { setStartPreview(null); setStartPreviewError(""); return; }
    const controller = new AbortController(); setStartPreview(null); setStartPreviewError("");
    let recoveryId = ""; try { recoveryId = sessionStorage.getItem(startStorageKey) ?? ""; } catch {}
    fetch(`/api/mix-workflow?${new URLSearchParams({ requestId: recoveryId, previewStart: "1", contactId: startPerson, mixId: selected })}`, { signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "The start could not be checked."); return result; }).then(result => { if (!controller.signal.aborted) setStartPreview(result); }).catch(reason => { if (!controller.signal.aborted) setStartPreviewError(reason.message); });
    return () => controller.abort();
  }, [selected, startOpen, startPerson, startPreviewAttempt, startStorageKey]);
  useEffect(() => {
    if (!initialInstanceId) return;
    const frame = requestAnimationFrame(() => { const work = document.querySelector<HTMLElement>(`[data-workflow-instance="${CSS.escape(initialInstanceId)}"]`); work?.scrollIntoView({ block: "start" }); work?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [initialInstanceId]);
  const refreshSequence = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const lastResponse = useRef("");
  // Background refreshes stay silent and change nothing when the Journey is unchanged, so names never flash.
  const refresh = async ({ background = false } = {}) => {
    const sequence = ++refreshSequence.current; if (!background) setRefreshing(true);
    try {
    const response = await fetch(`/api/mix-workflow?${new URLSearchParams({ contactId, q: peopleFilter.query, node: peopleFilter.node, status: peopleFilter.status, stage: peopleFilter.stage, peopleOffset: String(peopleFilter.offset), offset: String(offset), instanceId: savedView ? selectedInstance : "", focusedInstance: selectedInstance, days: String(resultDays) })}`);
    const result = await response.json(); if (sequence !== refreshSequence.current) return; if (!response.ok) throw new Error(result.error ?? "Journey could not refresh.");
    const content = JSON.stringify({ ...result, updatedAt: "" });
    if (content === lastResponse.current) setData(current => ({ ...current, updatedAt: result.updatedAt }));
    else { lastResponse.current = content; setData(current => !current.historical && !result.historical && result.revision < current.revision ? current : result); }
    setError("");
    } finally { if (sequence === refreshSequence.current) setRefreshing(false); }
  };
  const scope = useMemo(() => { const grouped = new Set(data.megaMixes.flatMap(item => item.mixIds)); const chosen = data.megaMixes.find(item => item.id === megaMix); return megaMix === "none" ? (id: string) => !grouped.has(id) : chosen ? (id: string) => chosen.mixIds.includes(id) : () => true; }, [data.megaMixes, megaMix]);
  const mixes = useMemo(() => data.mixes.filter(mix => scope(mix.id) && (archived || mix.status !== "ARCHIVED" || mix.pending > 0 || (data.analytics.nodes[`mix:${mix.id}`]?.current ?? 0) > 0)), [data.mixes, data.analytics.nodes, archived, scope]);
  // Keep overview controls usable after the graph transform scales their cards.
  const overviewTargetHeight = zoom < .7 ? 28 / zoom : undefined;
  const minimumNodeHeight = zoom < .7 ? 64 / zoom : 0;
  const layout = useMemo(() => layoutWorkflow(mixes, data.configuration.rules, expanded, minimumNodeHeight), [mixes, data.configuration.rules, expanded, minimumNodeHeight]);
  const canConfigure = data.canEdit && !data.historical;
  // Numbers follow the saved map, so they stay the same when archived Mixes are hidden.
  const journeyNumbers = useMemo(() => { const scoped = data.mixes.filter(mix => scope(mix.id)); const ids = new Set(scoped.map(mix => mix.id)); return numberJourney(scoped, { rules: data.configuration.rules.filter(rule => ids.has(rule.source.mixId)) }); }, [data.mixes, data.configuration, scope]);
  const beatNumbers = journeyNumbers.beats, mixNumbers = journeyNumbers.mixes;
  const numbered = (step: { id: string; name: string }) => beatNumbers[step.id] ? `${beatNumbers[step.id]} · ${step.name}` : step.name;
  const numberedTarget = (target: WorkflowTarget) => { const mix = data.mixes.find(item => item.id === target.mixId); if (!mix) return "Unavailable Mix"; const number = journeyTargetNumber(target, journeyNumbers), step = target.stepId ? mix.steps.find(item => item.id === target.stepId) : null; return `${number ? `${number} · ` : ""}${step ? `${step.name} in ` : ""}${mix.name}`; };
  // The list reads in journey order; Mixes without a position keep their saved order at the end.
  const listMixes = useMemo(() => mixes.map((mix, index) => ({ mix, index, number: mixNumbers[mix.id] })).sort((a, b) => a.number && b.number ? compareJourneyNumbers(a.number, b.number) : a.number ? -1 : b.number ? 1 : a.index - b.index).map(item => item.mix), [mixes, mixNumbers]);
  const connectPoints = useCallback((source: WorkflowTarget, target: WorkflowTarget, origin: HTMLButtonElement) => {
    setPathSelection(null); connectionOrigin.current = origin;
    const existing = data.configuration.rules.find(rule => workflowNodeKey(rule.source) === workflowNodeKey(source) && rule.routes.some(route => route.target && workflowNodeKey(route.target) === workflowNodeKey(target)));
    const targetMix = data.mixes.find(mix => mix.id === target.mixId);
    const targetName = target.stepId ? targetMix?.steps.find(step => step.id === target.stepId)?.name : targetMix?.name;
    setNotice(existing ? "Connection already exists." : "");
    setEditing(existing ?? {
      id: crypto.randomUUID(), name: `Continue to ${targetName ?? "the next step"}`.slice(0, 160), source,
      mode: "PARALLEL", enabled: false, join: null,
      routes: [{ id: crypto.randomUUID(), label: "After completion", when: "FINISHED", outcome: "", delayMinutes: 0, target, maxVisits: null, replace: false }],
    });
  }, [data.configuration.rules, data.mixes]);
  const showConnectionPoints = canConfigure && mode === "Setup" && !list && zoom >= .7;
  const panMode = useCanvasPan(canvasRef, Boolean(mixes.length) && !list);
  const connections = useWorkflowConnections({ graphRef, canvasRef, zoom, enabled: showConnectionPoints && !editing, onConnect: connectPoints });
  const closeEditor = () => { setEditing(null); setPane("map"); requestAnimationFrame(() => { const origin = connectionOrigin.current?.isConnected ? connectionOrigin.current : canvasRef.current; origin?.focus({ preventScroll: true }); origin?.scrollIntoView({ block: "nearest", behavior: "instant" }); }); };
  useEffect(() => { let active = true; const update = () => { if (active && !editing && !pathSelection && !connections.active && document.visibilityState === "visible" && !document.activeElement?.closest("form")) void refresh({ background: true }).catch(reason => setError(reason.message)); }; const timer = setInterval(update, 15000); window.addEventListener("focus", update); window.addEventListener("jitm:workflow-updated", update); return () => { active = false; clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("jitm:workflow-updated", update); }; }, [contactId, peopleFilter, resultDays, offset, editing, savedView, selectedInstance, connections.active, pathSelection]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!editing) void refresh().catch(reason => setError(reason.message)); }, [contactId, peopleFilter, resultDays, offset, savedView, selectedInstance]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitMap = () => { const canvas = canvasRef.current; if (canvas && canvas.clientWidth > 0) { setFitMode(true); setZoom(Math.min(1, Math.max(.15, (canvas.clientWidth - 20) / layout.width))); canvas.scrollTo({ left: 0, top: 0 }); } };
  useEffect(() => { if (!initialMixId) fitMap(); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !fitMode) return;
    const observer = new ResizeObserver(() => fitMap()); observer.observe(canvas);
    return () => observer.disconnect();
  }, [fitMode, layout.width, list]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const graph = graphRef.current; if (!graph) return;
    const origin = graph.getBoundingClientRect(); const next: Record<string, number> = {};
    graph.querySelectorAll<HTMLElement>("[data-workflow-beat]").forEach(element => { const rect = element.getBoundingClientRect(); if (!rect.width || !rect.height) return; next[element.dataset.workflowBeat!] = (rect.top - origin.top + rect.height / 2) / zoom; });
    setPorts(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    const heights: Record<string, number> = {};
    graph.querySelectorAll<HTMLElement>("[data-workflow-node]").forEach(element => { heights[element.dataset.workflowNode!] = element.getBoundingClientRect().height / zoom; });
    setNodeHeights(previous => JSON.stringify(previous) === JSON.stringify(heights) ? previous : heights);
  }, [layout, zoom, list]);
  const chosen = data.mixes.find(mix => mix.id === selected);
  const focusedInstances = data.instances.filter(item => !contactId || item.contactId === contactId);
  const instance = focusedInstances.find(item => item.id === selectedInstance);
  const selectedPerson = data.people.find(person => person.id === contactId);
  const activeMixIds = new Set(instance?.state.runs.filter(run => run.status === "ACTIVE").map(run => run.mixId) ?? (contactId ? focusedInstances.flatMap(item => item.state.runs.filter(run => run.status === "ACTIVE").map(run => run.mixId)) : data.mixes.filter(mix => (data.analytics.nodes[`mix:${mix.id}`]?.current ?? 0) > 0).map(mix => mix.id)));
  const selectedRules = data.configuration.rules.filter(rule => rule.source.mixId === selected || rule.routes.some(route => route.target?.mixId === selected) || rule.join?.target.mixId === selected);
  const acknowledgeSave = (revision: number, configuration: WorkflowConfiguration, message = "Configuration saved.") => {
    lastResponse.current = "";
    setData(current => ({ ...current, revision, configuration, updatedAt: new Date().toISOString() }));
    setNotice(message);
    setError("");
    // A failed read must never turn an acknowledged write into a failed save.
    void refresh().catch(() => setError(`${message} The latest progress could not refresh. Retry refreshing; you do not need to repeat the change.`));
  };
  const saveConfiguration = async (configuration: WorkflowConfiguration) => {
    const result = await saveWorkflowChange({ action: "configure", expectedRevision: data.revision, configuration });
    acknowledgeSave(result.revision, configuration);
  };
  const saveRule = async (rule: WorkflowRule, expectedRule: WorkflowRule | null) => {
    const result = await saveWorkflowChange({ action: "save-rule", rule, expectedRule });
    acknowledgeSave(result.revision, result.configuration); closeEditor();
  };
  const clearPath = () => { setPathSelection(null); setSelectedRoute(""); setPane("map"); requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true })); };
  const removePath = async (rule: WorkflowRule, removal: WorkflowPathRemoval) => {
    const result = await saveWorkflowChange({ action: "remove-path", expectedRule: rule, removal }, "delete");
    acknowledgeSave(result.revision, result.configuration, "Path deleted."); setEditing(null); clearPath();
  };
  const selectPath = (selection: WorkflowPathSelection) => {
    if (editing || connections.active) return;
    setPathSelection(selection); setSelectedRoute(selection.id); setNotice(""); setPane("details");
  };
  const toggle = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const delayLabel = (minutes: number) => minutes % 1440 === 0 ? `${minutes / 1440} days` : minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`;
  const paths = data.configuration.rules.flatMap(rule => rule.routes.flatMap(route => route.target ? [{ id: route.id, rule, removal: { kind: "route" as const, routeId: route.id }, source: rule.source.mixId, sourceStep: rule.source.stepId, destination: route.target.mixId, destinationStep: route.target.stepId, label: `${route.label}${route.when === "TIMEOUT" ? ` · wait ${delayLabel(route.delayMinutes)}` : route.delayMinutes ? ` · ${delayLabel(route.delayMinutes)} later` : ""}` }] : []));
  const joins = data.configuration.rules.flatMap(rule => rule.join ? rule.routes.flatMap(route => route.target ? [{ id: `${rule.id}:join:${route.id}`, rule, removal: { kind: "join" as const }, source: route.target.mixId, sourceStep: null, destination: rule.join!.target.mixId, destinationStep: rule.join!.target.stepId, label: rule.join!.mode === "ALL" ? "After all selected paths" : "After the first result" }] : []) : []);
  const edgeStatus = (id: string) => { const metric = data.metrics[id]; if (mode !== "Results" || !target || !metric || (measure === "outcomes" && goalRoute !== id) || (measure === "outcomes" ? metric.decisions : metric.eligible) < minimum) return "neutral"; return (measure === "outcomes" ? metric.selected / metric.decisions : metric.started / metric.eligible) * 100 >= Number(target) ? "strong" : "weak"; };
  const metricLabel = (id: string) => { const metric = data.metrics[id]; return metric ? measure === "outcomes" ? `${metric.selected}/${metric.decisions} recorded decisions · ${metric.undecided} awaiting an outcome` : `${metric.started}/${metric.eligible} eligible connections started · ${metric.held} held` : "No observations"; };
  const allPaths = [...paths, ...joins];
  const connectionEdges = allPaths.map(path => {
    const metric = data.metrics[path.id], health = edgeStatus(path.id);
    return { ...path, enabled: path.rule.enabled,
      selected: pathSelection?.id === path.id || path.removal.kind === "join" && pathSelection?.removal.kind === "join" && pathSelection.rule.id === path.rule.id,
      progress: mode === "Progress" ? instance?.state.transitions.filter(item => item.routeId === path.id && item.status !== "CANCELED").at(-1)?.status : undefined,
      health, result: mode === "Results" ? metric ? measure === "outcomes" ? `${metric.selected}/${metric.decisions} chose` : `${metric.started}/${metric.eligible} started` : "No observations" : undefined,
      description: `${path.label}: ${data.mixes.find(mix => mix.id === path.source)?.name} to ${data.mixes.find(mix => mix.id === path.destination)?.name}. ${path.rule.enabled ? "On" : "Draft or paused"}${mode === "Results" ? `. ${metricLabel(path.id)}. ${health === "strong" ? "Strong" : health === "weak" ? "Needs attention" : "No comparison"}` : ""}`,
    };
  });
  const connectionLayout = layoutWorkflowConnections(layout.nodes.map(node => ({ ...node, height: nodeHeights[node.id] ?? node.height })), connectionEdges, ports, layout.height, mode === "Results");
  const selectPeople = (node: string, status = "all") => {
    if (editing) return;
    setPathSelection(null); setPane("people");
    if (!node) setSelected(""); setSelectedRoute("");
    setMode("Progress"); setPeopleFilter(current => ({ ...current, node, status, offset: 0 }));
    requestAnimationFrame(() => { const heading = directoryRef.current?.querySelector<HTMLElement>("h2"); heading?.focus({ preventScroll: true }); if (window.innerWidth < 1200) directoryRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); });
  };
  const revealDetails = () => { setPane("details"); requestAnimationFrame(() => { sidebarRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true }); if (window.innerWidth < 1700) sidebarRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); }); };
  const selectMix = (id: string) => { if (editing) return; setPathSelection(null); setSelected(id); setSelectedRoute(""); setStartOpen(false); setPeopleFilter(current => ({ ...current, node: id ? `mix:${id}` : "", offset: 0 })); };
  const selectPerson = (id: string, instanceId?: string) => {
    if (editing) return;
    setContactId(id); setSelectedInstance(instanceId ?? ""); setOffset(0); setSavedView(false);
    setSelected(""); setPathSelection(null); setSelectedRoute(""); setMode("Progress"); setPane("map");
    requestAnimationFrame(() => { if (window.innerWidth < 1200) { mapHeadingRef.current?.focus({ preventScroll: true }); mapHeadingRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); } });
  };
  const clearPerson = () => { setContactId(""); setSelectedInstance(""); setSavedView(false); setOffset(0); setPane("map"); requestAnimationFrame(() => mapHeadingRef.current?.focus({ preventScroll: true })); };
  const population = (node: string) => data.analytics.nodes[node] ?? emptyWorkflowCounts();
  const metricTotals = Object.values(data.metrics).reduce((sum, value) => ({ started: sum.started + value.started, waiting: sum.waiting + value.waiting, held: sum.held + value.held }), { started: 0, waiting: 0, held: 0 });
  const feedback = <>{notice && <p className="notice" role="status">{notice}{notice.startsWith("Start saved") && <> <Link href="/settings/notifications">Set up reminders for me (optional)</Link>. These remind you; they do not enable customer sending.</>}</p>}{error && <p className="notice error" role="alert">{error} <button type="button" className="text-button" onClick={() => void refresh().catch(reason => setError(reason.message))}>Retry</button></p>}</>;
  return <div className={styles.workspace} data-mobile-pane={pane}>
    <nav className={styles.paneNav} aria-label="Journey workspace panels">
      {(["people", "map", "details"] as const).map(value => <button type="button" key={value} aria-pressed={pane === value} aria-controls={`journey-${value}-pane`} onClick={() => setPane(value)}><AppIcon name={value === "people" ? "people" : value === "map" ? "journey" : "more"} />{value === "people" ? "People" : value === "map" ? "Map" : "Details"}</button>)}
    </nav>
    <aside id="journey-people-pane" ref={directoryRef} className={styles.directory} aria-label="Journey directory">
      <header className={styles.directoryHeader}><h1>Journey</h1><div><BrandTermsHelp /><Link className="icon-button" href="/mixes" aria-label="My Mixes" title="My Mixes"><AppIcon name="mixes" /></Link>{data.canEdit && <Link className="icon-button" href="/mixes/new?custom=1" aria-label="Create a Mix" title="Create a Mix"><AppIcon name="plus" /></Link>}</div></header>
      <Link className="mix-clear-filters" href="/templates/journeys"><AppIcon name="journey" />Choose a complete Mega-Mix</Link>
      <div inert={Boolean(editing)}><WorkflowPeople selectedContactId={contactId} pending={refreshing} data={data.analytics} mixes={data.mixes} mixNumbers={mixNumbers} node={peopleFilter.node} status={peopleFilter.status} stage={peopleFilter.stage} query={peopleFilter.query} onFilter={patch => setPeopleFilter(current => ({ ...current, ...patch }))} onPerson={selectPerson} displayPreferences={displayPreferences} /></div>
    </aside>
    <section id="journey-map-pane" className={styles.main} aria-label="Mix and Beat journey">
      <header className={styles.mapHeader}><div><h2 ref={mapHeadingRef} tabIndex={-1}>Journey map</h2><p>{selectedPerson ? selectedPerson.displayName : megaMix === "none" ? "Mixes that are not in a Mega-Mix" : data.megaMixes.find(item => item.id === megaMix)?.name ?? "Your Mixes and the paths between them"}</p></div>{data.megaMixes.length > 0 && <div className={styles.megaMixSwitch}><label><span>Mega-Mix</span><select aria-label="Show Mega-Mix" value={megaMix} disabled={Boolean(editing)} onChange={event => { const value = event.target.value; setMegaMix(value); setSelected(""); setPathSelection(null); setSelectedRoute(""); setFitMode(true); const url = new URL(window.location.href); if (value) url.searchParams.set("megaMix", value); else url.searchParams.delete("megaMix"); url.searchParams.delete("mix"); window.history.replaceState(window.history.state, "", url); }}><option value="">All Mixes</option>{data.megaMixes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="none">Not in a Mega-Mix</option></select></label><Link href={megaMix && megaMix !== "none" ? `/mixes/mega?megaMix=${encodeURIComponent(megaMix)}` : "/mixes/mega"}>Manage</Link></div>}{contactId && <div className={styles.actions}><button type="button" className={`text-button ${styles.detailsShortcut}`} onClick={revealDetails}>View details</button><button type="button" disabled={Boolean(editing)} className="text-button" onClick={clearPerson}>All people</button></div>}</header>
      <WorkflowCountStrip disabled={Boolean(editing)} counts={data.analytics.summary} value={mode === "Progress" && !peopleFilter.node ? peopleFilter.status : ""} onSelect={status => selectPeople("", status)} />
      <div className={styles.toolbar}><div className={styles.tabs} aria-label="Journey view">{(["Setup", "Progress", "Results"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} disabled={Boolean(editing)} onClick={() => { setMode(value); setSavedView(false); setPathSelection(null); setSelectedRoute(""); }}>{value}</button>)}</div><button className="button small" type="button" disabled={Boolean(editing)} aria-expanded={mapOptions} onClick={() => setMapOptions(!mapOptions)} aria-label="Map options">Options</button></div>
      {mapOptions && <div className={styles.scope}><span>{mixes.length} {mixes.length === 1 ? "Mix" : "Mixes"} · {mixes.reduce((sum, mix) => sum + mix.steps.length, 0)} {mixes.reduce((sum, mix) => sum + mix.steps.length, 0) === 1 ? "Beat" : "Beats"}</span><label><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />Include archived</label><button className="button small" type="button" onClick={() => setList(!list)}>{list ? "Show diagram" : "Show list"}</button><label className={styles.find}><span className="sr-only">Find a Mix</span><select aria-label="Find a Mix" value={selected} onChange={event => selectMix(event.target.value)}><option value="">Find a Mix</option>{mixes.map(mix => <option value={mix.id} key={mix.id}>{mix.name}</option>)}</select></label><Link href="/settings/journey">Stage settings</Link></div>}
      {mode === "Results" && <div className={styles.metricControls}>
        <label>Measure <select value={measure} onChange={event => setMeasure(event.target.value)}><option value="starts">Connection starts</option><option value="outcomes">Path choices</option></select></label>
        <label>Period <select aria-label="Period" value={resultDays} onChange={event => setResultDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
        <div className={styles.resultTotals}><span><strong>{metricTotals.started}</strong> started</span><span><strong>{metricTotals.waiting}</strong> waiting</span><span><strong>{metricTotals.held}</strong> held</span></div>
        <details><summary>Targets and counting rules</summary><p>Work started in this period using the current setup (version {data.revision}). Counts measure connection visits, including repeats. They are separate from the live people counts above.</p>{measure === "outcomes" && <label>Goal path <select value={goalRoute} onChange={event => setGoalRoute(event.target.value)}><option value="">Counts only</option>{data.configuration.rules.flatMap(rule => rule.routes.map(route => <option key={route.id} value={route.id}>{rule.name}: {route.label}</option>))}</select></label>}<label>Target (%) <input type="number" min={0} max={100} value={target} placeholder="Optional" onChange={event => setTarget(event.target.value)} /></label><label>Minimum observations <input type="number" min={1} max={10000} value={minimum} onChange={event => setMinimum(Math.max(1, Number(event.target.value)))} /></label><p>Strong means at or above your target. Small samples stay neutral. Parallel choices may total more than 100%.</p></details>
      </div>}
      {mode === "Progress" && instance && instance.definitionRevision !== data.revision && !savedView && <p className={styles.scope}>This work follows an earlier setup (version {instance.definitionRevision}).</p>}{mode === "Progress" && selectedInstance && <label className={styles.scope}><input type="checkbox" checked={savedView} onChange={event => { setSavedView(event.target.checked); setPathSelection(null); }} />Show its saved map</label>}{data.historical && <p className={styles.scope}>Saved map · version {data.revision}. People counts remain current.</p>}
      {mode === "Progress" && contactId && <label className={styles.instanceSelect}>Highlight work<select aria-label="Highlight work" value={selectedInstance} onChange={event => setSelectedInstance(event.target.value)}><option value="">All current work</option>{focusedInstances.map(item => <option key={item.id} value={item.id}>{item.contactName} · {item.label}</option>)}</select></label>}

      {!mixes.length && megaMix ? <div className={styles.empty}><AppIcon name="journey" /><h2>No Mixes in this view</h2><p>{megaMix === "none" ? "Every Mix is in a Mega-Mix." : "Choose the Mixes that belong to this Mega-Mix."}</p>{megaMix !== "none" && <Link href={`/mixes/mega?megaMix=${encodeURIComponent(megaMix)}&edit=1`} className="button primary">Choose Mixes</Link>}<button type="button" className="button" onClick={() => { setMegaMix(""); const url = new URL(window.location.href); url.searchParams.delete("megaMix"); window.history.replaceState(window.history.state, "", url); }}>Show all Mixes</button></div> : !mixes.length ? <div className={styles.empty}><AppIcon name="mixes" /><h2>Create your first Mix</h2><p>Add a Mega-Mix for a ready-made pipeline, or build a Mix from scratch.</p><Link href="/templates/journeys" className="button primary"><AppIcon name="mixes" />Add a Mega-Mix</Link><Link href="/mixes/new?custom=1" className="button">Create a Mix</Link></div> : list ? <div className={styles.list}>{listMixes.map(mix => <article key={mix.id}><button type="button" className={styles.listHeading} onClick={() => selectMix(mix.id)}><MixNumber value={mixNumbers[mix.id]} />{mix.name}<span>{mixStatusLabel(mix.status)} · {mix.steps.length} {mix.steps.length === 1 ? "Beat" : "Beats"}</span></button><ol className={styles.numberedBeats}>{mix.steps.map(step => <li key={step.id}><BeatNumber value={beatNumbers[step.id]} />{step.name} <small>{data.configuration.gatedStepIds.includes(step.id) ? "Waits for a connection" : step.anchor === "CALENDAR_DAY" ? `Day ${step.dayOffset} from start` : "Appointment timing"}</small></li>)}</ol>{data.configuration.rules.filter(rule => rule.source.mixId === mix.id).map(rule => <div key={rule.id}><strong>{rule.name} · {rule.mode === "CHOICE" ? "Choose one" : "Together"}</strong><ul>{rule.routes.map(route => <li key={route.id}>{route.label} → {route.target ? numberedTarget(route.target) : "Finish this path"}{route.maxVisits ? ` · repeat limit ${route.maxVisits}` : ""}{mode === "Results" && <small> · {metricLabel(route.id)}{edgeStatus(route.id) === "strong" ? " · strong" : edgeStatus(route.id) === "weak" ? " · needs attention" : ""}</small>}</li>)}</ul></div>)}</article>)}</div> : <>
        <div className={styles.canvasControls}><button className="button small" aria-label="Zoom out" type="button" onClick={() => { setFitMode(false); setZoom(Math.max(.15, zoom - .1)); }}><AppIcon name="zoomOut" /></button><button className="button small" type="button" aria-label="Reset zoom to 100%" onClick={() => { setFitMode(false); setZoom(1); }}>{Math.round(zoom * 100)}%</button><button className="button small" aria-label="Zoom in" type="button" onClick={() => { setFitMode(false); setZoom(Math.min(1.5, zoom + .1)); }}><AppIcon name="zoomIn" /></button><button className="button small" type="button" onClick={() => fitMap()}><AppIcon name="fit" />Fit map</button><details className={styles.mapHelp}><summary>Help</summary><p>Move around the map: drag an empty area, hold Space and drag, or drag with the middle mouse button. On a phone, drag with one finger. Arrow keys scroll the focused map.</p>{mode === "Setup" && <><p>Drag + to →, or select both points. Expand a Mix to connect its Beats. Review the connection before saving. Select a line to edit or delete a path.</p><p>Use Tab and Enter to select points. Escape cancels.</p></>}</details></div>
        <div className={styles.connectionLegend} aria-label="Connection colors"><span data-direction="incoming">Into the selected Mix</span><span data-direction="outgoing">From the selected Mix</span><small>Select a Mix to follow its connections. Zoom in for line labels.</small></div>
        {showConnectionPoints && connections.hint}
        <div ref={canvasRef} className={styles.canvas} data-pan={panMode || undefined} onClick={event => { if (!(event.target as Element).closest("[data-workflow-node], [data-workflow-path], [data-workflow-edge-label]")) { setPathSelection(null); setSelectedRoute(""); } }} tabIndex={0} role="region" aria-label="Scrollable journey diagram. Drag the background, or hold Space and drag, to move around. A structured list is available above."><div style={{ width: layout.width * zoom, height: connectionLayout.height * zoom }}><div ref={graphRef} className={styles.graph} data-overview={zoom < .7} style={{ width: layout.width, height: connectionLayout.height, transform: `scale(${zoom})` }}>
          <WorkflowGraphEdges edges={connectionEdges} geometry={connectionLayout} width={layout.width} selectedMix={selected} preview={connections.preview} onSelect={id => { const path = allPaths.find(path => path.id === id); if (path) selectPath({ id: path.id, rule: path.rule, removal: path.removal }); }} />
          {layout.nodes.map(node => { const mix = mixes.find(item => item.id === node.id)!, rules = data.configuration.rules.filter(rule => rule.source.mixId === mix.id); return <article key={mix.id} className={styles.mixNode} data-selected={selected === mix.id} data-active={activeMixIds.has(mix.id)} style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }} data-workflow-node={mix.id}>{showConnectionPoints && mix.source !== "ONE_TIME" && mix.status !== "ARCHIVED" && <>{connections.port({ mixId: mix.id, stepId: null }, `${mix.name} · Mix`, "input")}{connections.port({ mixId: mix.id, stepId: null }, `${mix.name} · Mix`, "output")}</>}<button className={styles.nodeHeading} style={{ minHeight: overviewTargetHeight }} disabled={Boolean(editing)} type="button" onClick={() => selectMix(mix.id)} aria-pressed={selected === mix.id}><span className={styles.nodeIcon}><AppIcon name="mixes" /></span><span><strong style={{ fontSize: zoom < .7 ? `${(zoom < .3 ? 8 : 13) / zoom}px` : undefined }}>{mix.name}</strong><small>{mixStatusLabel(mix.status)} · {mix.source === "ONE_TIME" ? "One-time follow-ups" : mix.triggerMode === "MANUAL_START" ? "Manual or connected start" : mix.triggerMode === "BROADCAST" ? "Fixed-date start" : "Date-based start"}</small>{mixNumbers[mix.id] && <span className={styles.nodeNumber} style={{ fontSize: zoom < .7 ? `${(zoom < .3 ? 8 : 12) / zoom}px` : undefined }}><span className="sr-only">Mix </span>{mixNumbers[mix.id]}</span>}</span></button><div className={styles.nodePopulation} style={{ fontSize: zoom < .7 ? `${11 / zoom}px` : undefined }}><button type="button" style={{ minHeight: overviewTargetHeight }} disabled={Boolean(editing)} aria-label={`${mix.name}: ${population(`mix:${mix.id}`).current} people here, ${population(`mix:${mix.id}`).total} total`} onClick={() => { setSelected(mix.id); selectPeople(`mix:${mix.id}`); }}><strong>{population(`mix:${mix.id}`).current}</strong> here <span>· {population(`mix:${mix.id}`).total} total</span></button>{population(`mix:${mix.id}`).attention > 0 && <span data-status="attention">{population(`mix:${mix.id}`).attention} need attention</span>}</div><div className={styles.nodeSummary}><span>{mix.steps.length} {mix.steps.length === 1 ? "Beat" : "Beats"}</span><button type="button" aria-expanded={expanded.has(mix.id)} onClick={() => toggle(mix.id)}>{expanded.has(mix.id) ? "Collapse Beats" : "Show Beats"}</button></div>{expanded.has(mix.id) && <ol className={styles.nodeBeats}>{mix.steps.map(step => <li key={step.id} data-workflow-beat={step.id} data-active={instance?.state.visits.some(visit => visit.stepId === step.id && visit.status === "PENDING")}>{beatNumbers[step.id] ? <BeatNumber value={beatNumbers[step.id]} /> : <i aria-hidden="true" />}{showConnectionPoints && mix.source !== "ONE_TIME" && mix.status !== "ARCHIVED" && <>{connections.port({ mixId: mix.id, stepId: step.id }, `${numbered(step)} · Beat in ${mix.name}`, "input")}{connections.port({ mixId: mix.id, stepId: step.id }, `${numbered(step)} · Beat in ${mix.name}`, "output")}</>}<button type="button" disabled={Boolean(editing)} className={styles.beatHeading} onClick={() => { setSelected(mix.id); selectPeople(`beat:${step.id}`); }}><strong>{step.name}</strong><small>{data.configuration.gatedStepIds.includes(step.id) ? "After a connection" : step.anchor === "CALENDAR_DAY" ? `Day ${step.dayOffset} from start` : "From appointment"}</small><span className={styles.beatCount}>{population(`beat:${step.id}`).current} here · {population(`beat:${step.id}`).completed} completed</span></button></li>)}</ol>}<div className={styles.nodeRules}>{rules.map(rule => <button key={rule.id} type="button" disabled={Boolean(editing) || mode === "Setup" && !canConfigure} onClick={() => { selectMix(mix.id); if (mode === "Setup") setEditing(rule); else setSelectedRoute(rule.routes[0]?.id ?? ""); }}>{rule.mode === "CHOICE" ? "◇" : "⑂"} {rule.name}{!rule.enabled ? " · off" : ""}</button>)}</div>{!rules.length && <small className={styles.endpoint}>{data.configuration.intentionalEnds.includes(`mix:${mix.id}`) ? "✓ Finish here" : "No next connection"}</small>}</article>; })}
        </div></div></div>
      </>}
      {chosen && !list && <section className={styles.connectionFocus} aria-label={`Connections for ${chosen.name}`}>
        <header><h3>{chosen.name}</h3><button className="button small" type="button" onClick={revealDetails}>View Mix details</button><button className="text-button" type="button" onClick={() => { setSelected(""); setSelectedRoute(""); setPathSelection(null); }}>Clear selection</button></header>
        <div>{(["incoming", "outgoing"] as const).map(direction => {
          const related = allPaths.filter(path => direction === "incoming" ? path.destination === selected : path.source === selected);
          return <section key={direction} data-direction={direction}><h4>{direction === "incoming" ? "Into this Mix" : "From this Mix"} <span>{related.length}</span></h4>{related.length ? <ul>{related.map(path => <li key={path.id}><button type="button" disabled={Boolean(editing)} onClick={() => selectPath({ id: path.id, rule: path.rule, removal: path.removal })}><strong>{path.label}</strong><span>{connectionDirection(path, selected) === "return" ? "Returns to this Mix" : data.mixes.find(mix => mix.id === (direction === "incoming" ? path.source : path.destination))?.name}{!path.rule.enabled ? " · off" : ""}</span></button></li>)}</ul> : <p>{direction === "incoming" ? "No incoming connections. Start people here when they are ready." : "No outgoing connections."}</p>}</section>;
        })}</div>
      </section>}
      <div className={styles.footer}><span>Updated {formatTime(data.updatedAt, displayPreferences)}{editing ? " · refresh waits while editing" : ""}</span><span>{data.analytics.summary.current} people with ongoing work</span></div>
      {pane !== "details" && feedback}
    </section>
    <aside id="journey-details-pane" ref={sidebarRef} className={styles.sidebar} aria-label="Journey details">
      <h2 className={styles.contextHeading} tabIndex={-1}>Details</h2>
      {pane === "details" && feedback}
      {pathSelection && !editing && <WorkflowPathActions key={`${pathSelection.id}:${JSON.stringify(pathSelection.rule)}`} selection={pathSelection} mixes={data.mixes} beatNumbers={beatNumbers} mixNumbers={mixNumbers} gatedStepIds={data.configuration.gatedStepIds} canEdit={canConfigure} onClose={clearPath} onEdit={() => { setMode("Setup"); setEditing(pathSelection.rule); }} onRemove={() => removePath(pathSelection.rule, pathSelection.removal)} onReview={rule => {
        const removal = pathSelection.removal;
        if (removal.kind === "route" && !rule.routes.some(route => route.id === removal.routeId) || removal.kind === "join" && !rule.join) { clearPath(); setNotice("This path has already been removed."); }
        else setPathSelection({ ...pathSelection, rule });
        void refresh().catch(reason => setError(reason.message));
      }} />}
      {editing ? <WorkflowRuleEditor key={editing === "new" ? `new:${selected}` : editing.id} initial={editing === "new" ? undefined : editing} isNew={editing === "new" || !data.configuration.rules.some(rule => rule.id === editing.id)} mixes={data.mixes} beatNumbers={beatNumbers} mixNumbers={mixNumbers} configuration={data.configuration} sourceMixId={selected} onSave={saveRule} onDelete={editing === "new" || !data.configuration.rules.some(rule => rule.id === editing.id) ? undefined : expected => removePath(expected, { kind: "rule" })} onCancel={closeEditor} /> : <>
        {chosen && <section className={styles.selection}><div className={styles.instanceHeading}><h2><MixNumber value={mixNumbers[chosen.id]} />{chosen.name}</h2>{chosen.source !== "ONE_TIME" && chosen.status !== "ARCHIVED" && <Link href={`/mixes/${chosen.id}/edit`} className="button small">Edit Mix</Link>}</div><p>{chosen.steps.length} {chosen.steps.length === 1 ? "Beat" : "Beats"} · {chosen.pending} pending follow-ups{contactId ? " for this person" : ""}</p>
          <div className={styles.mixFacts}><span><strong>{population(`mix:${chosen.id}`).current}</strong> people in progress</span><span>{mixStatusLabel(chosen.status)} · {chosen.triggerMode === "MANUAL_START" ? "Manual or connected start" : "Scheduled start"}</span></div>
          <details className={styles.beatDetails}><summary>Beats in this Mix</summary><ol className={styles.numberedBeats}>{chosen.steps.map(step => <li key={step.id}><BeatNumber value={beatNumbers[step.id]} /><strong>{step.name}</strong><small>{data.configuration.gatedStepIds.includes(step.id) ? "Waits for a connection" : step.anchor === "CALENDAR_DAY" ? `Day ${step.dayOffset} from start` : "Appointment timing"}</small></li>)}</ol></details>{mode === "Setup" && canConfigure && chosen.source !== "ONE_TIME" && chosen.status !== "ARCHIVED" && <div className={styles.actions}><button className="button primary" type="button" onClick={() => setEditing("new")}>Connect next</button><button className="button" type="button" onClick={() => { setStartOpen(!startOpen); setStartRequestId(crypto.randomUUID()); }}>Start for someone</button></div>}
          {startOpen && <form className={styles.editor} onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); if (starting || !startPreview || startPreview.savedInstanceId) return; let requestId = startRequestId; try { requestId = sessionStorage.getItem(startStorageKey) ?? requestId; sessionStorage.setItem(startStorageKey, requestId); } catch {} setStarting(true); try { const result = await saveWorkflowChange({ action: "start", expectedDefinitionRevision: startPreview.revision, requestId, contactId: form.get("person"), mixId: chosen.id, label: form.get("label") }); try { sessionStorage.removeItem(startStorageKey); } catch {} window.history.replaceState(window.history.state, "", `/journey?${new URLSearchParams({ contactId: String(form.get("person")), work: result.instanceId })}`); setSelectedInstance(result.instanceId); setContactId(String(form.get("person"))); setOffset(0); setStartOpen(false); setMode("Progress"); setNotice("Start saved. Follow-ups are being prepared using your sending preferences."); void refresh().catch(() => setError("Start saved. Refresh to see its latest progress.")); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start."); } finally { setStarting(false); } }}><label className="field"><span>Person</span><select name="person" required value={startPerson} onChange={event => setStartPerson(event.target.value)}><option value="">Choose someone</option>{data.people.map(person => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select></label><div className={styles.peopleSearch}><input type="search" aria-label="Find someone to start" placeholder="Find someone" value={startSearch} onChange={event => setStartSearch(event.target.value)} /><button className="button small" type="button" onClick={() => setPeopleFilter(current => ({ ...current, query: startSearch, offset: 0 }))}>Find</button></div><label className="field"><span>Work label (optional)</span><input name="label" maxLength={160} placeholder={chosen.name} value={startLabel} onChange={event => setStartLabel(event.target.value)} /></label><Link href={`/contacts/new?${new URLSearchParams({ returnTo: workflowStartPath(chosen.id, undefined, startLabel) })}`}>Add a person</Link><Link href={`/contacts/import?${new URLSearchParams({ returnTo: workflowStartPath(chosen.id, undefined, startLabel) })}`}>Import people</Link><p className="muted-copy">Starts separate work using your sending preferences.</p>{startPerson && !startPreview && !startPreviewError && <p role="status">Checking this person and schedule…</p>}{startPreviewError && <p role="alert">{startPreviewError} <button className="text-button" type="button" onClick={() => setStartPreviewAttempt(value => value + 1)}>Check again</button></p>}{startPreview?.savedInstanceId && <p className="notice" role="status">This start was already saved. <Link href={`/journey?${new URLSearchParams({ contactId: startPerson, work: startPreview.savedInstanceId })}`}>Open its progress</Link>.</p>}{startPreview && !startPreview.savedInstanceId && <div><strong>{startPreview.contactName} · {startPreview.mixName}</strong><ol aria-label="Schedule before starting">{startPreview.steps.map((step, index) => <li key={index}>{step.name}: {step.dueAt ? formatDateTime(step.dueAt, { ...displayPreferences, timeZone: startPreview.timezone }) : "Waiting for an appointment"}</li>)}</ol><small>{zoneLabel(startPreview.timezone)} · {startPreview.automatic ? "Automatic sending is on. Eligible messages follow your review window and enabled channels." : "Customer messages wait for manual review; automatic sending is off."}</small></div>}<button className="button primary" disabled={starting || chosen.status !== "ACTIVE" || !startPreview || Boolean(startPreview.savedInstanceId)}>{starting ? "Starting…" : "Start this Mix"}</button></form>}
          <ul className={styles.connectionList}>{selectedRules.map(rule => <li key={rule.id}><button type="button" disabled={!canConfigure} onClick={() => { setMode("Setup"); setEditing(rule); }}><strong>{rule.name}</strong><small>{rule.mode === "CHOICE" ? "Choose one path" : "Matching paths together"} · {rule.enabled ? "on" : "off"}</small>{rule.routes.map(route => <small key={route.id}>{route.label} → {route.target ? data.mixes.find(mix => mix.id === route.target?.mixId)?.name ?? "Unavailable Mix" : "Finish this path"}{route.target?.stepId ? ` · ${data.mixes.flatMap(mix => mix.steps).find(step => step.id === route.target?.stepId) ? numbered(data.mixes.flatMap(mix => mix.steps).find(step => step.id === route.target?.stepId)!) : "Beat"}` : ""}</small>)}{rule.join && <small>Then join after {rule.join.mode === "ALL" ? "all selected paths" : "the first path"} finish.</small>}</button></li>)}</ul>
          {mode === "Setup" && canConfigure && chosen.steps.some(step => data.configuration.gatedStepIds.includes(step.id)) && <details><summary>Beats waiting for a connection</summary>{chosen.steps.filter(step => data.configuration.gatedStepIds.includes(step.id)).map(step => <div key={step.id}><strong>{step.name}</strong><button className="text-button" type="button" disabled={data.configuration.rules.some(rule => rule.routes.some(route => route.target?.stepId === step.id) || rule.join?.target.stepId === step.id)} onClick={() => void saveConfiguration({ ...data.configuration, gatedStepIds: data.configuration.gatedStepIds.filter(id => id !== step.id) }).catch(reason => setError(reason.message))}>Restore scheduled start</button><small>Remove its incoming paths first. Applies to people who start after this.</small></div>)}</details>}
          {mode === "Setup" && canConfigure && <label className="checkbox-label"><input type="checkbox" checked={data.configuration.intentionalEnds.includes(`mix:${chosen.id}`)} onChange={event => { const key = `mix:${chosen.id}`, checked = event.target.checked; void saveConfiguration({ ...data.configuration, intentionalEnds: checked ? [...data.configuration.intentionalEnds, key] : data.configuration.intentionalEnds.filter(item => item !== key) }).catch(reason => setError(reason.message)); }} />Finish this path here</label>}
        </section>}
        {mode === "Setup" && <>
          {!chosen && <p className="muted-copy">Select a Mix or drag points to connect.</p>}
          <details className={styles.diagnostics} open={data.issues.length > 0 || undefined}><summary>{data.issues.length ? `${data.issues.length} setup issues` : "No setup issues"}</summary>{data.issues.length ? <ul>{data.issues.map((issue, index) => <li key={`${issue.node}:${index}`}><button type="button" className="text-button" onClick={() => { const mix = data.mixes.find(item => issue.node === `mix:${item.id}` || item.steps.some(step => issue.node === `beat:${step.id}`)); if (mix) selectMix(mix.id); }}>{issue.message}</button></li>)}</ul> : <p>All configured paths pass the setup checks.</p>}</details>
          <WorkflowSimulation key={`${data.revision}:${selected}`} data={data} initialMixId={selected} />
          <button className="button" type="button" onClick={() => selectPeople(selected ? `mix:${selected}` : "")}>View people and progress</button>
        </>}
        {mode === "Results" && <section className={styles.connectionResults} aria-label="Connection results"><h2>Connection results</h2>{data.configuration.rules.flatMap(rule => rule.routes.filter(route => !selectedRoute || route.id === selectedRoute).map(route => { const metric = data.metrics[route.id]; return <article key={route.id}><strong>{route.label}</strong><small>{rule.name}</small><p>{metricLabel(route.id)}</p>{metric && <small>{metric.waiting} waiting · {metric.held} held · {metric.canceled} canceled</small>}{edgeStatus(route.id) !== "neutral" && <span data-status={edgeStatus(route.id) === "weak" ? "attention" : "completed"}>{edgeStatus(route.id) === "weak" ? "Below target" : "At or above target"}</span>}{canConfigure && <button className="text-button" type="button" onClick={() => { setMode("Setup"); setEditing(rule); }}>Edit connection</button>}</article>; }))}{!Object.keys(data.metrics).length && <p>Nobody has moved along these paths in this period yet.</p>}{selectedRoute && <button className="text-button" type="button" onClick={() => setSelectedRoute("")}>All connections</button>}</section>}
        {mode !== "Setup" && <>
          {contactId && <section className={styles.people}><div className={styles.instanceHeading}><h2 tabIndex={-1}>{selectedPerson?.displayName ?? "Selected person"}</h2><button className="text-button" type="button" onClick={clearPerson}>All people</button></div><p><Link href={`/contacts/${contactId}`}>Open contact</Link></p>{!focusedInstances.length && <p>{refreshing ? "Loading progress…" : "No Mix work to show. Open the contact to review follow-ups or start a Mix."}</p>}{focusedInstances.map(item => <WorkflowInstanceCard key={item.id} instance={item} displayPreferences={displayPreferences} canEdit={data.canEdit} onUpdate={() => void refresh().catch(reason => setError(reason.message))} />)}<div className={styles.actions}>{offset > 0 && <button className="button small" onClick={() => setOffset(Math.max(0, offset - 50))}>Previous work</button>}{offset + data.instances.length < data.instanceTotal && <button className="button small" onClick={() => setOffset(offset + 50)}>More work</button>}</div></section>}

        </>}

        {!chosen && !contactId && mode === "Progress" && <section className={styles.contextEmpty}><AppIcon name="journey" /><h3>Your journey</h3><dl className={styles.overviewFacts}><div><dt>Mixes</dt><dd>{mixes.length}</dd></div><div><dt>Beats</dt><dd>{mixes.reduce((sum, mix) => sum + mix.steps.length, 0)}</dd></div><div><dt>Enabled connections</dt><dd>{data.configuration.rules.filter(rule => rule.enabled).length}</dd></div></dl><p>Select a person to see their progress, or a Mix on the map to explore its Beats and connections.</p><button type="button" className="text-button" onClick={() => selectPeople(peopleFilter.node)}>Choose a person</button></section>}
      </>}
      {children}
    </aside>
  </div>;
}

/** A Beat's number: its Mix's number and its letter within that Mix, such as A3.b. */
function BeatNumber({ value }: { value?: string }) {
  return value ? <b className={styles.beatNumber} title={`Beat ${value}`}><span className="sr-only">Beat </span>{value}</b> : null;
}

/** A Mix's number: its journey's letter and its place in that journey, such as A3. */
function MixNumber({ value }: { value?: string }) {
  return value ? <b className={styles.mixNumber} title={`Mix ${value}`}><span className="sr-only">Mix </span>{value}</b> : null;
}
