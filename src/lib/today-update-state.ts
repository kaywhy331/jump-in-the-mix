/** DOM markers are owned by the editors and Undo controls, including closed sheets. A draft the
 * owner is still in, saved or not, keeps the list from reordering under them. */
export function todayUpdateBlocker(root: ParentNode): "draft" | "undo" | null {
  if (root.querySelector('[data-follow-up-editing="true"], [data-follow-up-draft="true"]')) return "draft";
  if (root.querySelector('[data-follow-up-undo="true"]')) return "undo";
  return null;
}
