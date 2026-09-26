/** Keep keyboard focus clear of the app's persistent navigation and save bars. */
export function revealObscuredFocus(control: EventTarget | null) {
  if (!(control instanceof HTMLElement) || !control.matches(":focus-visible")) return;
  const bounds = control.getBoundingClientRect();
  const modal = control.closest("dialog:modal");
  const obscured = Array.from(document.querySelectorAll<HTMLElement>(".sticky-form-actions, .calendar-save-actions, .mobile-nav, .mobile-app-header")).some(overlay => {
    if (overlay.contains(control) || !overlay.checkVisibility() || overlay.closest("dialog:modal") !== modal) return false;
    const position = getComputedStyle(overlay).position;
    if (position !== "fixed" && position !== "sticky") return false;
    const rect = overlay.getBoundingClientRect();
    return bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top;
  });
  if (obscured) control.scrollIntoView({ block: "center", behavior: "instant" });
}
