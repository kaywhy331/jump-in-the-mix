/** DOM markers are owned by the editors, including closed sheets. A draft the owner is still in, saved or not, keeps the
 * list from reordering under them. Confirmations and their Undo sit outside the list, so they no longer hold it (D99). */
export function todayUpdateBlocker(root: ParentNode): "draft" | null {
  return root.querySelector('[data-follow-up-editing="true"], [data-follow-up-draft="true"]') ? "draft" : null;
}
