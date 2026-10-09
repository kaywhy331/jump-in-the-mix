"use client";
import Link from "next/link";
import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { MegaMixPreview } from "@/components/MegaMixPreview";
import { MegaMixSetup, type ContactStagesState } from "@/components/MegaMixSetup";
import { MEGA_MIXES, megaMixById } from "@/lib/mega-mixes";
import { workflowStartPath } from "@/lib/workflow-continuation";
import type { JourneySetupValues } from "@/lib/journey-preferences";
import { tailorMegaMix } from "@/lib/journey-preferences";
import styles from "./MegaMix.module.css";
import { mixStatusLabel } from "@/lib/display-labels";

export type InstalledMegaMix = { blueprintId: string; version: number; mixes: Array<{ id: string; name: string; status: string }> };
export function MegaMixLibrary({ selectedId, installed, added, canEdit, initialSetup, contactStages }: { selectedId: string; installed: InstalledMegaMix[]; added: boolean; canEdit: boolean; initialSetup: JourneySetupValues; contactStages: ContactStagesState }) {
  const [setup, setSetup] = useState(initialSetup);
  const blueprint = tailorMegaMix(megaMixById(selectedId) ?? MEGA_MIXES[0], setup);
  const installation = installed.find(item => item.blueprintId === blueprint.id);
  const [pane, setPane] = useState<"library" | "preview" | "setup">(added ? "setup" : "preview");
  // The first active Mix follows the blueprint order, so it is the journey's entry point.
  const entryMix = installation?.mixes.find(mix => mix.status === "ACTIVE");
  return <div className={styles.workspace} data-pane={pane}>
    <h1 className="sr-only">Mega-Mixes</h1>
    <nav className={styles.panes} aria-label="Mega-Mix workspace panels">{([['library', 'Mega-mixes'], ['preview', 'Preview'], ['setup', installation ? 'My setup' : 'Add journey']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={pane === value} onClick={() => setPane(value)}>{label}</button>)}</nav>
    <aside className={styles.directory} aria-label="Mega-Mix library"><h2>Mega-Mixes</h2><p>Choose a whole journey for your work.</p><Link className={styles.back} href="/templates"><AppIcon name="chevronLeft" />Ready-made Mixes</Link>
      <nav aria-label="Choose a Mega-Mix">{MEGA_MIXES.map(item => <Link className={styles.choice} href={`/templates/journeys?journey=${item.id}`} key={item.id} aria-current={item.id === blueprint.id ? "page" : undefined}><AppIcon name="journey" /><span><strong>{item.name}</strong><small>{item.nodes.length} connected mixes{installed.some(row => row.blueprintId === item.id) ? " · Added" : ""}</small></span></Link>)}</nav>
    </aside>
    <section className={styles.center} aria-label="Mega-Mix preview"><MegaMixPreview blueprint={blueprint} /><button className={`button primary ${styles.mobileNext}`} type="button" onClick={() => { setPane("setup"); window.scrollTo({ top: 0 }); }}>{installation ? "View my setup" : "Set up this journey"}</button></section>
    <aside className={styles.setup} aria-label="Mega-Mix setup">
      {installation ? <><h2>{added ? "Your pipeline is ready" : "Already in your Journey"}</h2><p role={added ? "status" : undefined}>{added ? `All ${installation.mixes.length} Mixes from the ${blueprint.name} Mega-Mix are in your account, with every Beat already written and connected from first inquiry onward. Edit any wording so it sounds like you. Nothing is sent until you start someone.` : `${installation.mixes.length} Mixes from the ${blueprint.name} Mega-Mix are in your account. Your saved edits and paths are kept.`}</p>
        {canEdit && entryMix && <Link className="button primary" href={`/contacts/new?${new URLSearchParams({ returnTo: workflowStartPath(entryMix.id) })}`}><AppIcon name="userPlus" />Add your first customer</Link>}
        <Link className={canEdit && entryMix ? "button" : "button primary"} href="/journey"><AppIcon name="journey" />Open my Journey</Link>
        <h3>Start where the person is</h3><p>{entryMix ? `New customers start at ${entryMix.name}. Already working with someone? Start the Mix that matches where they are.` : "Review a Mix below or start it for someone."} Its connected paths carry that person forward as you record decisions.</p>
        <ul className={styles.installed}>{installation.mixes.map(mix => <li key={mix.id}><Link href={`/mixes?mix=${mix.id}`}><strong>{mix.name}</strong><small>{mixStatusLabel(mix.status)}</small></Link>{canEdit && mix.status === "ACTIVE" && <Link className="button small" href={`/journey?mix=${mix.id}&start=1`} aria-label={`Start ${mix.name} for someone`}><AppIcon name="play" />Start</Link>}</li>)}</ul>
        {installation.mixes.length < blueprint.nodes.length && <p>Some included Mixes have been removed. Adding this Mega-Mix again preserves those changes; it does not recreate them.</p>}
        <p className={styles.boundary}>The preview shows the supplied starting point. Your Journey shows your current, editable setup.</p>
      </> : <><h2>Make it yours</h2>{canEdit ? <MegaMixSetup key={blueprint.id} initialId={blueprint.id} initialSetup={setup} onSetupChange={setSetup} contactStages={contactStages} /> : <p>Administrator support sessions are view-only.</p>}</>}
    </aside>
  </div>;
}
