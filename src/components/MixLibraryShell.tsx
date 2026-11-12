"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ScrollPager, type ScrollPagerPane } from "@/components/ScrollPager";

type Pane = "library" | "beats" | "details";

export function MixLibraryShell({ children, selectedMixId, explicitSelection }: { children: ReactNode; selectedMixId?: string; explicitSelection: boolean }) {
  const [pane, setPane] = useState<Pane>(explicitSelection ? "beats" : "library");
  useEffect(() => { setPane(explicitSelection ? "beats" : "library"); }, [selectedMixId, explicitSelection]);
  // The phone switcher's tabs; on a touch screen up to 1024px the panes also page by swiping (JITM-07 §2.18, JITM-08 §2.46).
  // Each screen wraps its panes in ScrollPagerPanel with these ids: the directory, the selected item and its details.
  const panes: ScrollPagerPane<Pane>[] = [
    { id: "library", label: "Mixes", icon: "mixes" },
    { id: "beats", label: "Beats", icon: "message", disabled: !selectedMixId },
    { id: "details", label: "Details", icon: "people", disabled: !selectedMixId }
  ];
  return <ScrollPager label="Mix workspace panels" panes={panes} selected={pane} onSelect={setPane} tabsClassName="mix-phone-panes" trackClassName="mix-library-shell"
    trackProps={{ onClick: event => { if ((event.target as Element).closest("a.mix-library-item")) setPane("beats"); } }}>{children}</ScrollPager>;
}
