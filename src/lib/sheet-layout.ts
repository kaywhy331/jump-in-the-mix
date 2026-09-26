export const DOCKED_REVIEW_MEDIA = "(min-width: 768px)";

export function isDockedReview(dialog: HTMLDialogElement) {
  return dialog.classList.contains("follow-up-review-sheet") && window.matchMedia(DOCKED_REVIEW_MEDIA).matches;
}

/** Retain each editor while allowing only one desktop review to occupy the pane. */
export function openSheet(dialog: HTMLDialogElement, preserveFocus = false) {
  if (dialog.open) return;
  if (isDockedReview(dialog)) {
    const focused = document.activeElement;
    const scroll = { left: window.scrollX, top: window.scrollY };
    document.querySelectorAll<HTMLDialogElement>(".follow-up-review-sheet[open]").forEach(other => {
      if (other !== dialog) other.close();
    });
    dialog.show();
    if (preserveFocus) {
      if (focused instanceof HTMLElement && focused !== document.body) focused.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo({ ...scroll, behavior: "instant" });
    }
  } else dialog.showModal();
}
