# Journey connection handles

Journey Setup now supports drawing connections between actual account Mixes and Beats. The existing violet surfaces, typography, light/dark themes, responsive canvas and connection editor remain the design foundation. The original supplied export is unchanged.

## Interaction contract

- Drag a right-side output (+) to a left-side input (→). Expanding a Mix exposes the same handles on its Beats. Starting at an input and drawing back to an output also works.
- Clicking/tapping two points or selecting them with Tab and Enter/Space provides the same result. Escape or Cancel connection abandons the selection. Invalid/outside drops, pointer cancellation, lost capture and window blur do not save anything.
- The live preview follows zoom and scrolling. Near a canvas edge, dragging pans the canvas; hovering a valid target stops that pan. Help and cancellation controls reserve their space so points do not move when a gesture begins.
- A completed gesture opens the shared editor with both endpoints filled in. New connections start disabled until the user chooses to enable and save them. Existing endpoint pairs open their existing rule instead of creating duplicate automation. Multiple paths, conditions, waits and repeat limits remain editable there.
- Input/output points are available in the current editable Setup diagram at readable zoom (70% or above). In the overview, selecting a Mix zooms in. Historical configurations, read-only access, archived/one-time Mixes, Progress and Results do not expose editable points.
- While the editor is open, drawing is disabled to retain the draft. Opening the editor moves focus to its heading; closing it returns focus to the original point. Save errors retain the draft and receive focus. A missing loop limit opens its disclosure.
- Saving uses the existing revision check, account ownership validation and workflow configuration endpoint. Beat targets retain the existing connection-gated entry behavior. There are no database, worker or execution-engine changes.

## Verification

A disposable local database and synthetic account were used, with phone-call Beats and no contact delivery addresses. Seven browser scenarios passed: all four endpoint combinations; save/reload and duplicate reopening; keyboard/reverse selection and bounded loops; cancellation and view changes; zoomed mouse dragging plus real touch taps and dragging; automatic canvas panning; and themes, accessibility, narrow layouts and read-only state.

Light and dark screenshots at 320, 390, 834 and 1440px were checked for page overflow, and the Journey surface passed Axe. Phone and desktop screenshots were inspected against the shared design. Nineteen workflow-engine/date-rendering tests passed. Static validation, TypeScript checking and the final production build passed. Evidence is under ignored `.artifacts/workflow-connections-20260921/`.

Live publication and verification are recorded below after deployment.
