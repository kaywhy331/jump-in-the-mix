"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";

export function MixLibraryShell({ children, selectedMixId, explicitSelection }: { children: ReactNode; selectedMixId?: string; explicitSelection: boolean }) {
  const [pane, setPane] = useState<"library" | "beats" | "details">(explicitSelection ? "beats" : "library");
  useEffect(() => { setPane(explicitSelection ? "beats" : "library"); }, [selectedMixId, explicitSelection]);
  return <div className="mix-library-shell" data-mobile-pane={pane} onClick={event => { if ((event.target as Element).closest("a.mix-library-item")) setPane("beats"); }}>
    <nav className="mix-phone-panes" aria-label="Mix workspace panels">
      <button type="button" aria-pressed={pane === "library"} onClick={() => setPane("library")}><AppIcon name="mixes" />Mixes</button>
      <button type="button" aria-pressed={pane === "beats"} disabled={!selectedMixId} onClick={() => setPane("beats")}><AppIcon name="message" />Beats</button>
      <button type="button" aria-pressed={pane === "details"} disabled={!selectedMixId} onClick={() => setPane("details")}><AppIcon name="people" />Details</button>
    </nav>{children}
  </div>;
}
