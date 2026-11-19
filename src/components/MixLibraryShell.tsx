"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ScrollPager, type ScrollPagerPane } from "@/components/ScrollPager";

export type MixLibraryPane = "library" | "beats" | "details";
/** What a screen with a selected item renders: the directory, the item and its details. */
export const ITEM_PANES: MixLibraryPane[] = ["library", "beats", "details"];
/** What a screen without an item renders: the directory alone. */
export const DIRECTORY_PANES: MixLibraryPane[] = ["library"];

/**
 * `panes` lists the panes this screen renders a ScrollPagerPanel for, in its current state (a new Mega-Mix has its form and
 * no details). A tab whose pane is not listed is disabled, so no tab is ever enabled without its panel (JITM-10 §2.26).
 */
export function MixLibraryShell({ children, selectedMixId, explicitSelection, panes: rendered }: { children: ReactNode; selectedMixId?: string; explicitSelection: boolean; panes: MixLibraryPane[] }) {
  const opening: MixLibraryPane = explicitSelection && rendered.includes("beats") ? "beats" : "library";
  const [pane, setPane] = useState<MixLibraryPane>(opening);
  useEffect(() => { setPane(opening); }, [selectedMixId, opening]);
  // The phone switcher's tabs; on a touch screen up to 1024px the panes also page by swiping (JITM-07 §2.18, JITM-08 §2.46).
  // Each screen wraps its panes in ScrollPagerPanel with these ids: the directory, the selected item and its details.
  const panes: ScrollPagerPane<MixLibraryPane>[] = [
    { id: "library", label: "Mixes", icon: "mixes", disabled: !rendered.includes("library") },
    { id: "beats", label: "Beats", icon: "message", disabled: !rendered.includes("beats") },
    { id: "details", label: "Details", icon: "people", disabled: !rendered.includes("details") }
  ];
  return <ScrollPager label="Mix workspace panels" panes={panes} selected={pane} onSelect={setPane} tabsClassName="mix-phone-panes" trackClassName="mix-library-shell"
    trackProps={{ onClick: event => { if ((event.target as Element).closest("a.mix-library-item")) setPane("beats"); } }}>{children}</ScrollPager>;
}
