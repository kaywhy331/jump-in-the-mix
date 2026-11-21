"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";

/**
 * The Mix library's panes. A page's `back` control (JITM-BACK-03) rides in the phone pane row, in the panes that hide the
 * directory; the page shows the same control at the top of its directory, and only one of the two is ever shown.
 */
export function MixLibraryShell({ children, selectedMixId, explicitSelection, back }: { children: ReactNode; selectedMixId?: string; explicitSelection: boolean; back?: ReactNode }) {
  const [pane, setPane] = useState<"library" | "beats" | "details">(explicitSelection ? "beats" : "library");
  useEffect(() => { setPane(explicitSelection ? "beats" : "library"); }, [selectedMixId, explicitSelection]);
  return <div className="mix-library-shell" data-mobile-pane={pane} onClick={event => { if ((event.target as Element).closest("a.mix-library-item")) setPane("beats"); }}>
    <nav className="mix-phone-panes" aria-label="Mix workspace panels">
      {back}
      <button type="button" aria-pressed={pane === "library"} onClick={() => setPane("library")}><AppIcon name="mixes" />Mixes</button>
      <button type="button" aria-pressed={pane === "beats"} disabled={!selectedMixId} onClick={() => setPane("beats")}><AppIcon name="message" />Beats</button>
      <button type="button" aria-pressed={pane === "details"} disabled={!selectedMixId} onClick={() => setPane("details")}><AppIcon name="people" />Details</button>
    </nav>{children}
  </div>;
}
