import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserAccountBoundary } from "../../src/components/BrowserAccountBoundary";
import { Sheet } from "../../src/components/Sheet";
import { TodayDueSections, TodayLiveCounts, TodayMomentum } from "../../src/components/TodayMomentum";
import { TodayReviewPlacement, TodayReviewSheet, useTodayReviewPlacement } from "../../src/components/TodayReviewPlacement";

/** Real client components, isolated from server reads so the close/commit ordering is reproducible. */
function Card({ id }: { id: string }) {
  const record = () => {
    const review = document.querySelector<HTMLDialogElement>('[data-jump-workflow="first"] dialog')!;
    // Close in the frame in which momentum acts. The browser observes the close before the automatic click,
    // but React is free to defer the pin-release render until after that frame's callbacks have completed.
    requestAnimationFrame(() => requestAnimationFrame(() => review.close()));
    window.dispatchEvent(new CustomEvent("jitm:jump-state", { detail: { jumpId: id, status: "DONE", origin: "review" } }));
  };
  return <div data-jump-workflow={id}>
    <TodayReviewSheet title={id} className="follow-up-review-sheet" trigger={<button data-review-trigger>Review {id}</button>}>
      <p>{id} review</p>
      {id === "first" && <button onClick={record}>Record outcome</button>}
    </TodayReviewSheet>
  </div>;
}
function PlacementState() {
  const { pin } = useTodayReviewPlacement();
  return <output data-placement>{pin?.section ?? "released"}</output>;
}
function TodayFixture() {
  const root = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const group = {
    contactId: "person", section: arrived ? "today" as const : "overdue" as const,
    jumpIds: arrived ? ["first", "next"] : ["first"],
    content: <div data-today-contact="person" data-person-group><Card id="first" />{arrived && <Card id="next" />}</div>
  };
  return <div ref={root}>
    <button onClick={() => setArrived(true)}>Receive next follow-up</button>
    {ready && <TodayReviewPlacement root={root} viewKey="fixture">
      <PlacementState />
      <TodayLiveCounts initial={{ overdue: arrived ? 0 : 1, today: arrived ? 2 : 0, upcoming: 0, done: 0 }} overdue={1} readAt={String(arrived)} doneCounts={{ done: true, skipped: true }} zero="Nothing due" dueGroups={[group]}>
        <TodayDueSections />
      </TodayLiveCounts>
      <TodayMomentum />
    </TodayReviewPlacement>}
  </div>;
}
const kind = new URL(location.href).searchParams.get("kind");
createRoot(document.getElementById("root")!).render(kind === "account-focus"
  ? <BrowserAccountBoundary scope="fixture-account"><div style={{ minHeight: "300vh", paddingTop: 200 }}><input aria-label="Field X" /><input aria-label="Field Y" /></div></BrowserAccountBoundary>
  : kind === "account"
  ? <BrowserAccountBoundary scope="fixture-account"><Sheet title="Profile" trigger={<button>Profile</button>}><input aria-label="Draft" defaultValue="Keep my draft" /></Sheet></BrowserAccountBoundary>
  : <TodayFixture />);
