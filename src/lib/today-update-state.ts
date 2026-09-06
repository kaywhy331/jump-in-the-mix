/** DOM markers are owned by the editors and Undo controls, including closed sheets. */
export function todayUpdateBlocker(root: ParentNode): "draft" | "undo" | null {
  if (root.querySelector('[data-follow-up-draft="true"]')) return "draft";
  if (root.querySelector('[data-follow-up-undo="true"]')) return "undo";
  return null;
}
